from typing import Optional
from pydantic import BaseModel
from app.models.base import BaseArtifact

class ServiceComponent(BaseModel):
    name: str
    responsibility: str
    technology: str
    scales_horizontally: bool
    single_point_of_failure: bool

class ArchitectureModel(BaseArtifact):
    architecture_pattern: str
    components: list[ServiceComponent]
    database_primary: str
    database_replica_strategy: str
    caching_layer: str
    message_queue: Optional[str]
    cdn_required: bool
    ha_strategy: str
    dr_rto_minutes: int
    dr_rpo_minutes: int
    identified_spofs: list[str]
    architecture_decisions: list[str]
