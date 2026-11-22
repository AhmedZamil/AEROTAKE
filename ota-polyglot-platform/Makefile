.PHONY: ensure-dev-secrets tenants tenant-add up down build logs ps clean seed-check smoke proto-lint test migrate migrate-add

## Bring the full stack up (infra + 3 services)
up: ensure-dev-secrets
	docker compose up --build -d

## Append stable local JWT signing keys and frontend service credentials to .env if they are missing
## (append-only: never overwrites, since replacing them would end every session / cut the frontends off).
ensure-dev-secrets:
	@grep -q '^JWT_SIGNING_KEYS=' .env 2>/dev/null || scripts/generate-jwt-keys.sh --write-env
	@grep -q '^SERVICE_CLIENTS=' .env 2>/dev/null || scripts/generate-service-clients.sh --write-env

## Tear everything down, keep volumes
down:
	docker compose down

## Tear down including data volumes (destructive)
clean:
	docker compose down -v --remove-orphans

build:
	docker compose build

logs:
	docker compose logs -f --tail=100

ps:
	docker compose ps

## Verify seed data landed (agents + markup rules)
seed-check:
	docker compose exec postgres psql -U $${POSTGRES_USER:-ota} -d $${POSTGRES_DB:-ota} \
		-c 'SELECT "DisplayName","Tier","CreditLimit" FROM identity_agents."Agents";' \
		-c 'SELECT "Tier","MarkupPercent","SubAgentDefaultMargin" FROM pricing."MarkupRules";'

## End-to-end smoke: health of all three services
smoke:
	curl -fsS http://localhost:8080/healthz && echo " core-engine OK"
	curl -fsS http://localhost:8000/healthz && echo " ai-engine OK"
	curl -fsS -o /dev/null -w "frontend %{http_code}\n" http://localhost:3000

## Validate proto compiles (requires protoc on host)
proto-lint:
	protoc --proto_path=shared/protos --descriptor_set_out=/dev/null shared/protos/ota.proto && echo "ota.proto OK"

## Run core-engine's test suite (requires .NET 10 SDK + Docker for Testcontainers).
## Safe while `make up` is running: the container writes obj/bin under /tmp (T-3).
test:
	dotnet test apps/core-engine-dotnet/tests/Ota.CoreEngine.Tests/Ota.CoreEngine.Tests.csproj

## Apply all pending EF Core migrations to the running Postgres
## (requires `dotnet tool restore` once in apps/core-engine-dotnet/).
## Safe while the compose core-engine watch is running (T-3).
migrate:
	cd apps/core-engine-dotnet/src && dotnet ef database update

## Scaffold a new migration: make migrate-add name=AddSomething
migrate-add:
	cd apps/core-engine-dotnet/src && dotnet ef migrations add $(name)

## List registered tenants and domains
tenants:
	docker compose exec -T postgres psql -U $${POSTGRES_USER:-ota} -d $${POSTGRES_DB:-ota} \
		-c 'SELECT t."TenantId", t."SellCurrency", t."IsActive" AS tenant_active, d."Host", d."Channel", d."IsActive" AS domain_active FROM tenancy."Tenants" t LEFT JOIN tenancy."TenantDomains" d ON d."TenantId" = t."TenantId" ORDER BY 1, 4;'

## Add/update a tenant domain — see scripts/provision-tenant.sh --help for the flags:
##   make tenant-add ARGS='--tenant-id acme --name Acme --currency BDT --host acme.example ...'
tenant-add:
	scripts/provision-tenant.sh $(ARGS)
