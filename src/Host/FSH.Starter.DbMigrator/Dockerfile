# syntax=docker/dockerfile:1.7

# Build on the runner's native platform and cross-compile for the target
# (-a $TARGETARCH), so arm64 images don't need slow QEMU emulation.
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG TARGETARCH
WORKDIR /src

COPY src/ ./src/

# Project-level restore — the .dockerignore at repo root excludes src/Tests/
# which the solution file references, so `dotnet restore src/FSH.Starter.slnx`
# would fail inside the build context. Project-level restore pulls the same
# transitive graph for our purposes.
RUN dotnet restore src/Host/FSH.Starter.DbMigrator/FSH.Starter.DbMigrator.csproj -a $TARGETARCH
RUN dotnet publish src/Host/FSH.Starter.DbMigrator/FSH.Starter.DbMigrator.csproj \
    -c Release \
    -a $TARGETARCH \
    --no-restore \
    -o /publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled AS runtime
WORKDIR /app
COPY --from=build /publish .

USER $APP_UID
# Migrator reads DOTNET_ENVIRONMENT to pick appsettings.<env>.json overrides.
ENV DOTNET_ENVIRONMENT=Production
ENTRYPOINT ["dotnet", "FSH.Starter.DbMigrator.dll"]
# Default command: apply migrations. Compose overrides with `command: ["apply"]`
# explicitly so it's grep-able in the compose file.
CMD ["apply"]
