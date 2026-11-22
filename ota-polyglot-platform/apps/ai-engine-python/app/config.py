"""Environment-driven settings (12-factor)."""

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://ota:ota@localhost:5432/ota"
    booking_created_topic: str = "booking-created"
    redis_url: str = "redis://localhost:6379/1"

    # Alerting — unprefixed and shared with the other two services (same
    # Slack webhook / SMTP target for the whole platform). validation_alias
    # bypasses the AI_ prefix applied to the fields above.
    slack_webhook_url: str | None = Field(default=None, validation_alias="SLACK_WEBHOOK_URL")
    smtp_host: str | None = Field(default=None, validation_alias="SMTP_HOST")
    smtp_port: int = Field(default=587, validation_alias="SMTP_PORT")
    smtp_user: str | None = Field(default=None, validation_alias="SMTP_USER")
    smtp_password: str | None = Field(default=None, validation_alias="SMTP_PASSWORD")
    smtp_from: str = Field(default="alerts@ota-platform.local", validation_alias="SMTP_FROM")
    smtp_to: str = Field(default="oncall@ota-platform.local", validation_alias="SMTP_TO")

    model_config = {"env_prefix": "AI_", "env_file": ".env", "extra": "ignore"}


settings = Settings()
