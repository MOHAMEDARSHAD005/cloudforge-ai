from typing import Optional
from pydantic import BaseModel
from app.models.base import BaseArtifact

class AwsService(BaseModel):
    service_name: str
    purpose: str
    configuration: str
    alternatives_considered: list[str]
    justification: str

class AwsArchitecture(BaseArtifact):
    primary_region: str
    secondary_region: Optional[str]
    vpc_design: str
    services: list[AwsService]
    networking_topology: str
    load_balancer_type: str
    auto_scaling_strategy: str
    backup_strategy: str
    aws_well_architected_notes: list[str]
