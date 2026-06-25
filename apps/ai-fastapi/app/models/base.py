from pydantic import BaseModel
from datetime import datetime

class BaseArtifact(BaseModel):
    schema_version: str = "1.0"
    prompt_version: str
    model_name: str
    provider_name: str
    generated_at: datetime
