# syntax=docker/dockerfile:1.7

# ── Build stage ─────────────────────────────────────────────────────
# Build on the runner's native platform and cross-compile for the target
# (-a $TARGETARCH), so arm64 images don't need slow QEMU emulation.
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG TARGETARCH
WORKDIR /src

# Copy the entire src/ tree so dotnet restore + publish have everything
# they need (Directory.Build.props / Directory.Packages.props / global.json
# centralize versions, so we can't easily prune to just one project).
# Note: src/Tests/ is excluded via .dockerignore — restore targets the API
# project directly (not the solution) to avoid referencing missing test projects.
COPY src/ ./src/

RUN dotnet restore src/Host/FSH.Starter.Api/FSH.Starter.Api.csproj -a $TARGETARCH
RUN dotnet publish src/Host/FSH.Starter.Api/FSH.Starter.Api.csproj \
    -c Release \
    -a $TARGETARCH \
    --no-restore \
    -o /publish

# ── Runtime stage ──────────────────────────────────────────────────
# Chiseled = no shell, no apt, no debugger. Smaller pull + smaller CVE
# surface. APP_UID (1654) is the non-root user baked into the image.
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled AS runtime
WORKDIR /app
COPY --from=build /publish .

USER $APP_UID
ENV ASPNETCORE_URLS=http://+:8080 \
    DOTNET_ENVIRONMENT=Production
EXPOSE 8080
ENTRYPOINT ["dotnet", "FSH.Starter.Api.dll"]
