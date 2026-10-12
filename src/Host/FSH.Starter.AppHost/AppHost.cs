using Aspire.Hosting.ApplicationModel;

var builder = DistributedApplication.CreateBuilder(args);

// Per-app prefix from the AppHost assembly name (FSH.Starter.AppHost -> fsh-starter); namespaces Docker volumes + resource names so multiple FSH apps don't clash.
#pragma warning disable CA1308 // resource + volume names are conventionally lowercase
var appPrefix = builder.Environment.ApplicationName
    .Replace(".AppHost", string.Empty, StringComparison.OrdinalIgnoreCase)
    .Replace('.', '-')
    .ToLowerInvariant();
#pragma warning restore CA1308

// Postgres + pgAdmin sidecar (auto-discovers registered databases); persistent so volumes and saved state survive restarts.
var postgresServer = builder.AddPostgres("postgres")
    .WithDataVolume($"{appPrefix}-postgres-data")
    .WithLifetime(ContainerLifetime.Persistent)
    .WithPgAdmin(pa => pa
        .WithHostPort(5050)
        .WithLifetime(ContainerLifetime.Persistent));

var postgres = postgresServer.AddDatabase("fsh-db");

// Warm pooled-connection floor for the long-running API — Npgsql's default Minimum Pool Size of 0 lets the pool drain to cold, so /health/ready's ~10 concurrent DbContext checks cold-open a cohort at once and intermittently stall the probe; a floor keeps connections warm for reuse.
var apiPgConnection = ReferenceExpression.Create(
    $"{postgres.Resource.ConnectionStringExpression};Minimum Pool Size=5");

// Valkey (BSD-3 Redis fork) as a plain container: Aspire 13.4.0 AddRedis() forces TLS-by-default in run mode and never materializes the container, so we drop to plain RESP over TCP. Name stays "redis" so config keys don't churn.
var redis = builder.AddContainer("redis", "valkey/valkey", "9.1.0")
    .WithEndpoint(targetPort: 6379, scheme: "tcp", name: "tcp")
    .WithVolume($"{appPrefix}-redis-data", "/data")
    .WithLifetime(ContainerLifetime.Persistent);

var redisEndpoint = redis.GetEndpoint("tcp");
var redisConnectionString = ReferenceExpression.Create(
    $"{redisEndpoint.Property(EndpointProperty.HostAndPort)}");

// RedisInsight cache browser (dev-only) sidecar; RI_REDIS_* pre-registers the Valkey connection via the container-network alias "redis".
builder.AddContainer("redis-insight", "redis/redisinsight", "latest")
    .WithHttpEndpoint(port: 5540, targetPort: 5540, name: "http")
    .WithEnvironment("RI_REDIS_HOST0", "redis")
    .WithEnvironment("RI_REDIS_PORT0", "6379")
    .WithEnvironment("RI_REDIS_ALIAS0", "fsh-cache")
    .WithEnvironment("RI_ACCEPT_TERMS_AND_CONDITIONS", "true")
    .WithLifetime(ContainerLifetime.Persistent)
    .WaitFor(redis);

// Object storage (RustFS, S3-compatible; replaces MinIO, which stopped publishing community images). CORS via RUSTFS_CORS_ALLOWED_ORIGINS so browser presigned PUTs from the admin (:5173) and pharmacy web (:3000) dev origins work without proxying through the API.
const string S3Bucket = "fsh-uploads";
const string AdminOrigin = "http://localhost:5173";
const string PharmacyWebOrigin = "http://localhost:3000";

var s3User = builder.AddParameter("s3-user", "rustfsadmin");
var s3Password = builder.AddParameter("s3-password", "rustfsadmin", secret: true);

var s3 = builder.AddContainer("rustfs", "rustfs/rustfs", "1.0.1")
    .WithHttpEndpoint(port: 9000, targetPort: 9000, name: "api")
    .WithHttpEndpoint(port: 9001, targetPort: 9001, name: "console")
    .WithEnvironment("RUSTFS_VOLUMES", "/data")
    .WithEnvironment("RUSTFS_ADDRESS", "0.0.0.0:9000")
    .WithEnvironment("RUSTFS_CONSOLE_ADDRESS", "0.0.0.0:9001")
    .WithEnvironment("RUSTFS_CONSOLE_ENABLE", "true")
    .WithEnvironment("RUSTFS_ACCESS_KEY", s3User)
    .WithEnvironment("RUSTFS_SECRET_KEY", s3Password)
    .WithEnvironment("RUSTFS_CORS_ALLOWED_ORIGINS", $"{AdminOrigin},{PharmacyWebOrigin}")
    .WithVolume($"{appPrefix}-rustfs-data", "/data")
    .WithLifetime(ContainerLifetime.Persistent);

// Init container: bucket bootstrap (create + public-read) via the AWS CLI. Script normalized to LF so /bin/sh doesn't choke on Windows CRLF.
var s3InitScript = ($$"""
s3() { aws --endpoint-url http://rustfs:9000 "$@"; }
until s3 s3 ls >/dev/null 2>&1; do
  echo "waiting for rustfs...";
  sleep 2;
done;
s3 s3api head-bucket --bucket {{S3Bucket}} 2>/dev/null || s3 s3 mb s3://{{S3Bucket}};
s3 s3api put-bucket-policy --bucket {{S3Bucket}} --policy '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":"*","Action":["s3:GetObject"],"Resource":["arn:aws:s3:::{{S3Bucket}}/*"]}]}';
""").ReplaceLineEndings("\n");

var s3Init = builder.AddContainer("s3-init", "amazon/aws-cli", "2.37.12")
    .WithEntrypoint("/bin/sh")
    .WithArgs("-c", s3InitScript)
    .WithEnvironment("AWS_ACCESS_KEY_ID", s3User)
    .WithEnvironment("AWS_SECRET_ACCESS_KEY", s3Password)
    .WithEnvironment("AWS_DEFAULT_REGION", "us-east-1")
    .WaitFor(s3);

var s3ApiEndpoint = s3.GetEndpoint("api");

// DB migrator: applies pending migrations + seeds the root admin (admin@root.com), then exits; the API waits for its completion so it never starts against an unmigrated DB. Seed password is a dev-only default.
var migrator = builder.AddProject<Projects.FSH_Starter_DbMigrator>($"{appPrefix}-db-migrator")
    .WithReference(postgres)
    .WaitFor(postgres)
    .WithEnvironment("DatabaseOptions__Provider", "POSTGRESQL")
    .WithEnvironment("DatabaseOptions__ConnectionString", postgres.Resource.ConnectionStringExpression)
    .WithEnvironment("DatabaseOptions__MigrationsAssembly", "FSH.Starter.Migrations.PostgreSQL")
    .WithEnvironment("Seed__DefaultAdminPassword", "123Pa$$word!")
    .WithArgs("apply", "--seed");

// Demo seeder (dev-only): provisions the acme/globex tenants + demo-login users via seed-demo. DOTNET_ENVIRONMENT=Development is required (console host ignores ASPNETCORE_ENVIRONMENT) or seed-demo refuses to run.
var demoSeeder = builder.AddProject<Projects.FSH_Starter_DbMigrator>($"{appPrefix}-demo-seeder")
    .WithReference(postgres)
    .WaitFor(postgres)
    .WaitForCompletion(migrator)
    .WithEnvironment("DOTNET_ENVIRONMENT", "Development")
    .WithEnvironment("DatabaseOptions__Provider", "POSTGRESQL")
    .WithEnvironment("DatabaseOptions__ConnectionString", postgres.Resource.ConnectionStringExpression)
    .WithEnvironment("DatabaseOptions__MigrationsAssembly", "FSH.Starter.Migrations.PostgreSQL")
    .WithEnvironment("Seed__DemoPassword", "Password123!")
    .WithArgs("seed-demo");

// API Service
var api = builder.AddProject<Projects.FSH_Starter_Api>($"{appPrefix}-api")
    .WithReference(postgres)
    .WaitFor(postgres)
    .WaitFor(redis)
    .WaitForCompletion(s3Init)
    .WaitForCompletion(migrator)
    .WaitForCompletion(demoSeeder)
    .WithExternalHttpEndpoints()
    .WithEnvironment("DatabaseOptions__Provider", "POSTGRESQL")
    .WithEnvironment("DatabaseOptions__ConnectionString", apiPgConnection)
    .WithEnvironment("DatabaseOptions__MigrationsAssembly", "FSH.Starter.Migrations.PostgreSQL")
    .WithEnvironment("CachingOptions__Redis", redisConnectionString)
    .WithEnvironment("CachingOptions__EnableSsl", "false")
    // Hangfire dashboard (/jobs) creds — [Required], Password [MinLength(12)], ValidateOnStart; API won't boot without them. Dev-only, mirrors appsettings.Development.json.
    .WithEnvironment("HangfireOptions__UserName", "admin")
    .WithEnvironment("HangfireOptions__Password", "Password123!")
    // SMTP for local dev: no credentials are committed. Put your own (e.g. a free https://ethereal.email inbox) in
    // this AppHost's user-secrets and they are forwarded below:
    //   dotnet user-secrets --project src/Host/FSH.Starter.AppHost set "MailOptions:Smtp:Host" "smtp.ethereal.email"
    //   (also MailOptions:From, MailOptions:Smtp:Port, MailOptions:Smtp:UserName, MailOptions:Smtp:Password)
    .WithEnvironment("MailOptions__UseSendGrid", "false")
    .WithEnvironment("MailOptions__From", builder.Configuration["MailOptions:From"] ?? string.Empty)
    .WithEnvironment("MailOptions__DisplayName", builder.Configuration["MailOptions:DisplayName"] ?? "PharmaCare (dev)")
    .WithEnvironment("MailOptions__Smtp__Host", builder.Configuration["MailOptions:Smtp:Host"] ?? string.Empty)
    .WithEnvironment("MailOptions__Smtp__Port", builder.Configuration["MailOptions:Smtp:Port"] ?? "587")
    .WithEnvironment("MailOptions__Smtp__UserName", builder.Configuration["MailOptions:Smtp:UserName"] ?? string.Empty)
    .WithEnvironment("MailOptions__Smtp__Password", builder.Configuration["MailOptions:Smtp:Password"] ?? string.Empty)
    // Emailed links (confirm email, reset password) open the pharmacy web app below.
    .WithEnvironment("OriginOptions__OriginUrl", "http://localhost:3000")
    .WithEnvironment("Storage__Provider", "s3")
    .WithEnvironment("Storage__S3__Bucket", S3Bucket)
    .WithEnvironment("Storage__S3__Region", "us-east-1")
    .WithEnvironment("Storage__S3__ServiceUrl", s3ApiEndpoint)
    .WithEnvironment("Storage__S3__AccessKey", s3User)
    .WithEnvironment("Storage__S3__SecretKey", s3Password)
    .WithEnvironment("Storage__S3__ForcePathStyle", "true")
    .WithEnvironment("Storage__S3__PublicBaseUrl", ReferenceExpression.Create($"{s3ApiEndpoint}/{S3Bucket}"));

// Pharmacy web (Next.js BFF in clients/pharmacywebapp). Server-side proxy calls the API's HTTPS endpoint directly (the http->https 307 strips Authorization); dev-cert trust lets Node accept the self-signed localhost cert.
builder.AddJavaScriptApp("pharmacy-web", "../../../clients/pharmacywebapp", "dev")
    .WithYarn()
    .WithReference(api)
    .WaitFor(api)
    .WithHttpEndpoint(port: 3000, targetPort: 3000, env: "PORT", isProxied: false)
    .WithExternalHttpEndpoints()
    .WithDeveloperCertificateTrust(true)
    .WithEnvironment("DOTNET_API_URL", api.GetEndpoint("https"))
    .WithEnvironment("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

//#if (frontend)
// Admin console (React + Vite). Target the API's HTTPS endpoint directly — UseHttpsRedirection's 307 to https is cross-origin and strips the Authorization header.
builder.AddJavaScriptApp($"{appPrefix}-admin", "../../../clients/admin", "dev")
    .WithNpm()
    .WithReference(api)
    .WaitFor(api)
    .WithHttpEndpoint(port: 5173, targetPort: 5173, isProxied: false)
    .WithExternalHttpEndpoints()
    .WithEnvironment("VITE_API_BASE_URL", api.GetEndpoint("https"));
//#else
// React apps excluded: discard the unused api handle to keep the no-frontend scaffold warning-clean (S1481 under TreatWarningsAsErrors).
_ = api;
//#endif

await builder.Build().RunAsync();
