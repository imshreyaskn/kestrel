"""
Runtime Skill Loader (Codename: Kestrel)
Loads runtime skill definitions per IMPLEMENTATION_SPEC.md §8.4.
Distinguishes app runtime skills from IDE skills.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger("kestrel.skill_loader")


@dataclass
class RuntimeSkill:
    name: str
    version: int
    purpose: str
    instructions: str
    metadata: dict[str, Any]


class SkillLoader:
    def __init__(self, skills_dir: Path | str | None = None) -> None:
        if skills_dir is None:
            # Default to runtime-skills/ in project root
            project_root = Path(__file__).resolve().parent.parent.parent.parent
            self.skills_dir = project_root / "runtime-skills"
        else:
            self.skills_dir = Path(skills_dir)

    def load_skill(self, skill_name: str) -> RuntimeSkill | None:
        """
        Load a skill by name (e.g., 'ship-30-for-30').
        Looks for {skills_dir}/{skill_name}/SKILL.md.
        """
        skill_file = self.skills_dir / skill_name / "SKILL.md"
        if not skill_file.is_file():
            logger.warning(f"Runtime skill not found: {skill_file}")
            return None

        try:
            content = skill_file.read_text(encoding="utf-8")
            return self._parse_skill_content(content, fallback_name=skill_name)
        except (OSError, UnicodeDecodeError) as exc:
            logger.error(f"Failed to read skill file {skill_file}: {exc}")
            return None

    def _parse_skill_content(self, content: str, fallback_name: str) -> RuntimeSkill:
        metadata: dict[str, Any] = {}
        instructions = content

        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                try:
                    parsed_yaml = yaml.safe_load(parts[1])
                    if isinstance(parsed_yaml, dict):
                        metadata = parsed_yaml
                    instructions = parts[2].strip()
                except yaml.YAMLError as exc:
                    logger.warning(f"Failed parsing skill YAML frontmatter: {exc}")

        try:
            skill_version = int(metadata.get("version", 1))
        except (TypeError, ValueError):
            # Malformed frontmatter must not crash the essay workflow;
            # degrade to the default version rather than failing the run.
            logger.warning(
                "Skill %s has a non-integer version %r; defaulting to 1",
                fallback_name,
                metadata.get("version"),
            )
            skill_version = 1

        return RuntimeSkill(
            name=metadata.get("name", fallback_name),
            version=skill_version,
            purpose=str(metadata.get("purpose", "")),
            instructions=instructions,
            metadata=metadata,
        )


# Global default instance
default_skill_loader = SkillLoader()
