using FSH.Modules.Customers.Contracts.v1.Sms;
using FSH.Modules.Notifications.Contracts.v1.Sms;
using FSH.Modules.Notifications.Domain;
using FSH.Modules.Notifications.Jobs;
using FSH.Modules.Notifications.Sms;

namespace Notifications.Tests.Sms;

public sealed class SmsSegmentTests
{
    [Theory]
    [InlineData(0, 0)]
    [InlineData(1, 1)]
    [InlineData(160, 1)]
    [InlineData(161, 2)]
    [InlineData(306, 2)]
    [InlineData(307, 3)]
    public void Gsm_Segments(int length, int segments)
    {
        var info = SmsText.Count(new string('a', length));
        info.Encoding.ShouldBe(SmsText.Gsm);
        info.Length.ShouldBe(length);
        info.Segments.ShouldBe(segments);
    }

    [Fact]
    public void Gsm_Extension_Characters_Count_Twice()
    {
        var info = SmsText.Count("{}[]€");
        info.Encoding.ShouldBe(SmsText.Gsm);
        info.Length.ShouldBe(10);
    }

    [Fact]
    public void Extension_Characters_Push_Over_The_Single_Limit()
    {
        SmsText.Count(new string('a', 159) + "€").Segments.ShouldBe(2);
    }

    [Theory]
    [InlineData(70, 1)]
    [InlineData(71, 2)]
    [InlineData(134, 2)]
    [InlineData(135, 3)]
    public void Unicode_Segments(int length, int segments)
    {
        var info = SmsText.Count(new string('क', length));
        info.Encoding.ShouldBe(SmsText.Unicode);
        info.Segments.ShouldBe(segments);
    }

    [Fact]
    public void One_Nepali_Character_Makes_The_Whole_Message_Unicode()
    {
        var info = SmsText.Count(new string('a', 69) + "न");
        info.Encoding.ShouldBe(SmsText.Unicode);
        info.Segments.ShouldBe(1);
        SmsText.Count(new string('a', 70) + "न").Segments.ShouldBe(2);
    }
}

public sealed class SmsTemplateTests
{
    [Fact]
    public void Render_Fills_Every_Placeholder()
    {
        string text = SmsTemplates.Render(
            "Dear {customer}, {amount} for {invoice} was due on {due_date}. - {pharmacy}",
            new SmsTemplateValues("Ram", "Rs. 1,200.00", "13 Oct 2026", "City Pharmacy", "INV-7"));

        text.ShouldBe("Dear Ram, Rs. 1,200.00 for INV-7 was due on 13 Oct 2026. - City Pharmacy");
    }

    [Fact]
    public void Render_Is_Case_Insensitive_And_Keeps_Unknown_Placeholders()
    {
        SmsTemplates.Render("{Customer} {foo}", new SmsTemplateValues("Sita")).ShouldBe("Sita {foo}");
    }

    [Fact]
    public void Render_Collapses_Gaps_Left_By_Empty_Values()
    {
        SmsTemplates.Render("Bill {invoice} total", new SmsTemplateValues()).ShouldBe("Bill total");
    }

    [Fact]
    public void Unknown_Placeholders_Are_Reported()
    {
        SmsTemplates.UnknownPlaceholders("Hi {customer}, {balance} {Amount}").ShouldBe(["{balance}"]);
    }

    [Theory]
    [InlineData(SmsLanguages.English)]
    [InlineData(SmsLanguages.Nepali)]
    public void Default_Refill_Templates_Carry_The_Stop_Opt_Out(string language)
    {
        SmsTemplates.HasOptOut(SmsTemplates.Default(SmsKinds.RefillReminder, language)).ShouldBeTrue();
    }

    [Fact]
    public void Every_Default_Template_Uses_Only_Known_Placeholders()
    {
        foreach (string kind in SmsKinds.TemplateKinds.Append(SmsKinds.Test))
        {
            foreach (string language in SmsLanguages.All)
            {
                SmsTemplates.UnknownPlaceholders(SmsTemplates.Default(kind, language)).ShouldBeEmpty();
            }
        }
    }

    [Fact]
    public void Amounts_And_Dates_Follow_The_Language()
    {
        SmsTemplates.FormatAmount(1234.5m, SmsLanguages.English).ShouldBe("Rs. 1,234.50");
        SmsTemplates.FormatAmount(1234.5m, SmsLanguages.Nepali).ShouldBe("रु. 1,234.50");
        SmsTemplates.FormatDate(new DateOnly(2026, 10, 13), SmsLanguages.English).ShouldBe("13 Oct 2026");
        SmsTemplates.FormatDate(new DateOnly(2026, 10, 13), SmsLanguages.Nepali).ShouldStartWith("2083.06.");
    }

    [Fact]
    public void Invoice_List_Stays_Short()
    {
        SmsTemplates.InvoiceList(["INV-1"], SmsLanguages.English).ShouldBe("INV-1");
        SmsTemplates.InvoiceList(["INV-1", "INV-2", "INV-3", "INV-4"], SmsLanguages.English).ShouldBe("INV-1, INV-2 +2 more");
        SmsTemplates.InvoiceList([], SmsLanguages.English).ShouldBe("your account");
    }

    [Fact]
    public void Dues_Values_Sum_Outstanding_And_Take_The_Earliest_Due_Date()
    {
        var values = SmsMessageValues.Dues("Ram",
        [
            new CustomerSmsDueInvoiceDto(Guid.NewGuid(), "INV-2", 300m, new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc),
                new DateTime(2026, 9, 20, 0, 0, 0, DateTimeKind.Utc), 23, 42),
            new CustomerSmsDueInvoiceDto(Guid.NewGuid(), "INV-1", 200m, new DateTime(2026, 8, 1, 0, 0, 0, DateTimeKind.Utc),
                new DateTime(2026, 8, 31, 0, 0, 0, DateTimeKind.Utc), 43, 73),
        ], SmsLanguages.English);

        values.Amount.ShouldBe("Rs. 500.00");
        values.DueDate.ShouldBe("31 Aug 2026");
        values.Invoice.ShouldBe("INV-2, INV-1");
    }
}

public sealed class SmsQuietHoursTests
{
    // Nepal is UTC+05:45: 21:00 NPT = 15:15 UTC, 07:00 NPT = 01:15 UTC.
    private static DateTime Utc(int day, int hour, int minute) => new(2026, 10, day, hour, minute, 0, DateTimeKind.Utc);

    [Theory]
    [InlineData(15, 14, false)] // 20:59 NPT
    [InlineData(15, 15, true)]  // 21:00 NPT
    [InlineData(20, 0, true)]   // 01:45 NPT
    [InlineData(1, 14, true)]   // 06:59 NPT
    [InlineData(1, 15, false)]  // 07:00 NPT
    [InlineData(6, 0, false)]   // 11:45 NPT
    public void Default_Window_Is_21_To_7_Nepal_Time(int hour, int minute, bool quiet)
    {
        SmsQuietHours.IsQuiet(Utc(13, hour, minute), 21, 7).ShouldBe(quiet);
    }

    [Fact]
    public void Same_Start_And_End_Means_No_Quiet_Hours()
    {
        SmsQuietHours.IsQuiet(Utc(13, 18, 0), 0, 0).ShouldBeFalse();
    }

    [Fact]
    public void Window_Within_A_Day_Is_Supported()
    {
        SmsQuietHours.IsQuiet(Utc(13, 7, 15), 13, 14).ShouldBeTrue(); // 13:00 NPT
        SmsQuietHours.IsQuiet(Utc(13, 8, 15), 13, 14).ShouldBeFalse(); // 14:00 NPT
    }

    [Fact]
    public void Evening_Message_Waits_Until_Seven_Next_Morning()
    {
        SmsQuietHours.NextAllowedUtc(Utc(13, 16, 0), 21, 7).ShouldBe(Utc(14, 1, 15));
    }

    [Fact]
    public void Early_Morning_Message_Waits_Until_Seven_The_Same_Day()
    {
        SmsQuietHours.NextAllowedUtc(Utc(13, 20, 0), 21, 7).ShouldBe(Utc(14, 1, 15)); // 01:45 NPT on the 14th
        SmsQuietHours.NextAllowedUtc(Utc(14, 0, 0), 21, 7).ShouldBe(Utc(14, 1, 15));  // 05:45 NPT on the 14th
    }

    [Fact]
    public void Outside_Quiet_Hours_Sends_Now()
    {
        var now = Utc(13, 6, 0);
        SmsQuietHours.NextAllowedUtc(now, 21, 7).ShouldBe(now);
    }
}

public sealed class SmsDedupeTests
{
    private static readonly DateTime Now = new(2026, 10, 13, 6, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Invoice_Reminded_Within_The_Window_Is_Covered()
    {
        Guid a = Guid.NewGuid(), b = Guid.NewGuid();
        var recent = new[] { new RecentSms(SmsDedupe.Join([SmsDedupe.InvoiceKey(a)]), SmsStatus.Sent, Now.AddDays(-3)) };

        var open = SmsDedupe.Uncovered(new[] { a, b }, SmsDedupe.InvoiceKey, recent, Now, 7);

        open.ShouldBe([b]);
    }

    [Fact]
    public void Reminder_Older_Than_The_Window_Does_Not_Cover()
    {
        Guid a = Guid.NewGuid();
        var recent = new[] { new RecentSms(SmsDedupe.InvoiceKey(a), SmsStatus.Sent, Now.AddDays(-8)) };

        SmsDedupe.Uncovered(new[] { a }, SmsDedupe.InvoiceKey, recent, Now, 7).ShouldBe([a]);
    }

    [Fact]
    public void Failed_Reminder_Does_Not_Cover_But_Queued_Does()
    {
        Guid a = Guid.NewGuid(), b = Guid.NewGuid();
        var recent = new[]
        {
            new RecentSms(SmsDedupe.InvoiceKey(a), SmsStatus.Failed, Now.AddDays(-1)),
            new RecentSms(SmsDedupe.InvoiceKey(b), SmsStatus.Queued, Now.AddDays(-1)),
        };

        SmsDedupe.Uncovered(new[] { a, b }, SmsDedupe.InvoiceKey, recent, Now, 7).ShouldBe([a]);
    }

    [Fact]
    public void Manual_Reminder_Within_An_Hour_Is_A_Repeat()
    {
        SmsDedupe.IsManualRepeat([new RecentSms(null, SmsStatus.Sent, Now.AddMinutes(-30))], Now).ShouldBeTrue();
        SmsDedupe.IsManualRepeat([new RecentSms(null, SmsStatus.Sent, Now.AddMinutes(-61))], Now).ShouldBeFalse();
        SmsDedupe.IsManualRepeat([new RecentSms(null, SmsStatus.Failed, Now.AddMinutes(-5))], Now).ShouldBeFalse();
    }
}

public sealed class SmsPhoneAndConsentTests
{
    [Theory]
    [InlineData("9841234567", "9841234567")]
    [InlineData("+977 984-123-4567", "9841234567")]
    [InlineData("9779801234567", "9801234567")]
    [InlineData("9612345678", "9612345678")]
    [InlineData("01-4412345", null)]   // landline
    [InlineData("9541234567", null)]   // not a mobile prefix
    [InlineData("98412345", null)]     // too short
    [InlineData("98412345ab", null)]
    [InlineData(null, null)]
    public void Normalize(string? raw, string? expected)
    {
        SmsPhone.Normalize(raw).ShouldBe(expected);
    }

    [Fact]
    public void Mask_Keeps_Only_Two_Digits_At_Each_End()
    {
        SmsPhone.Mask("9841234567").ShouldBe("98******67");
    }

    [Fact]
    public void Automated_Reminders_Need_Consent_An_Active_Customer_And_A_Mobile()
    {
        var id = Guid.NewGuid();
        SmsReminderScanJob.Eligible(new CustomerSmsContactDto(id, "Ram", "9841234567", SmsConsent: true, IsActive: true))
            .ShouldBe("9841234567");
        SmsReminderScanJob.Eligible(new CustomerSmsContactDto(id, "Ram", "9841234567", SmsConsent: false, IsActive: true))
            .ShouldBeNull();
        SmsReminderScanJob.Eligible(new CustomerSmsContactDto(id, "Ram", "9841234567", SmsConsent: true, IsActive: false))
            .ShouldBeNull();
        SmsReminderScanJob.Eligible(new CustomerSmsContactDto(id, "Ram", "014412345", SmsConsent: true, IsActive: true))
            .ShouldBeNull();
    }
}
