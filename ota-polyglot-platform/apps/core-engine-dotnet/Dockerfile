# ---------------------------------------------------------------------------
# Ota.CoreEngine — .NET 10 booking & B2B ledger service
# Build context must be the REPO ROOT so /shared/protos is available:
#   docker build -f apps/core-engine-dotnet/Dockerfile .
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /workspace

COPY shared/protos/ shared/protos/
COPY apps/core-engine-dotnet/src/ apps/core-engine-dotnet/src/

WORKDIR /workspace/apps/core-engine-dotnet/src
RUN dotnet restore Ota.CoreEngine.csproj
RUN dotnet publish Ota.CoreEngine.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080 8081

HEALTHCHECK --interval=15s --timeout=5s --retries=10 \
  CMD curl -fsS http://localhost:8080/healthz || exit 1

# curl for healthcheck
USER root
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

ENTRYPOINT ["dotnet", "Ota.CoreEngine.dll"]
