from typing import Literal
from app.models.base import BaseArtifact

class ProjectPlan(BaseArtifact):
    system_name: str
    scale_tier: Literal["small", "medium", "large", "enterprise"]
    primary_use_case: str
    assumed_user_count: int
    assumed_peak_rps: int
    assumed_regions: list[str]
    key_assumptions: list[str]
    out_of_scope: list[str]
    execution_phases: list[str]
    critical_constraints: list[str]
    injection_detected: bool = False
