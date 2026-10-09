"""
Upstream Transcript Repository Syncer.
Manages shallow git clones/pulls or archive downloads from ChatPRD/lennys-podcast-transcripts,
extracts commit hash provenance, and discovers episode transcript files.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tarfile
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

DEFAULT_UPSTREAM_REPO = "https://github.com/ChatPRD/lennys-podcast-transcripts.git"
DEFAULT_ARCHIVE_URL = "https://github.com/ChatPRD/lennys-podcast-transcripts/archive/refs/heads/main.tar.gz"


class SyncError(Exception):
    """Raised when repository sync fails."""


def get_git_commit(repo_dir: Path) -> str | None:
    """Read HEAD commit SHA from a local git repository."""
    try:
        res = subprocess.run(
            ["git", "-C", str(repo_dir), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        )
        return res.stdout.strip()
    except (subprocess.SubprocessError, OSError) as e:
        logger.debug("Failed to read git commit from %s: %s", repo_dir, e)
        return None


def sync_transcripts_repo(
    target_dir: Path,
    repo_url: str = DEFAULT_UPSTREAM_REPO,
    archive_url: str = DEFAULT_ARCHIVE_URL,
) -> str:
    """
    Synchronize the upstream transcript repository into target_dir.

    1. Tries shallow git clone or pull if git is available.
    2. Falls back to downloading and extracting tarball if git fails.
    3. Returns the upstream commit SHA or version string.
    """
    target_dir.mkdir(parents=True, exist_ok=True)
    git_dir = target_dir / ".git"

    # Strategy 1: Git clone or pull
    git_available = shutil.which("git") is not None

    if git_available:
        try:
            if git_dir.exists():
                logger.info("Pulling latest upstream changes in %s", target_dir)
                subprocess.run(
                    ["git", "-C", str(target_dir), "pull", "--ff-only"],
                    check=True,
                    capture_output=True,
                    text=True,
                )
            else:
                logger.info(
                    "Cloning upstream repository %s into %s", repo_url, target_dir
                )
                subprocess.run(
                    ["git", "clone", "--depth", "1", repo_url, str(target_dir)],
                    check=True,
                    capture_output=True,
                    text=True,
                )
            commit = get_git_commit(target_dir)
            if commit:
                return commit
        except (subprocess.SubprocessError, OSError) as e:
            logger.warning("Git sync failed (%s). Falling back to archive download.", e)

    # Strategy 2: Download tarball archive
    try:
        logger.info("Downloading transcript archive from %s", archive_url)
        with httpx.Client(follow_redirects=True, timeout=60.0) as client:
            resp = client.get(archive_url)
            resp.raise_for_status()

            # Save temporary tarball
            archive_path = target_dir.parent / "transcripts_upstream.tar.gz"
            archive_path.write_bytes(resp.content)

            with tarfile.open(archive_path, "r:gz") as tar:
                # GitHub tarballs unpack into a top-level directory (e.g. lennys-podcast-transcripts-main/)
                members = tar.getmembers()
                prefix = members[0].name.split("/")[0] if members else ""
                tar.extractall(path=target_dir.parent)

            if archive_path.exists():
                archive_path.unlink()

            extracted_dir = target_dir.parent / prefix
            if extracted_dir.exists() and extracted_dir != target_dir:
                # Copy or move files into target_dir
                for item in extracted_dir.iterdir():
                    dest = target_dir / item.name
                    if dest.exists():
                        if dest.is_dir():
                            shutil.rmtree(dest)
                        else:
                            dest.unlink()
                    shutil.move(str(item), str(target_dir))
                shutil.rmtree(extracted_dir, ignore_errors=True)

        return "archive-main"
    except (httpx.HTTPError, tarfile.TarError, OSError) as e:
        raise SyncError(f"Failed to synchronize transcripts repository: {e}") from e


def discover_transcripts(base_dir: Path) -> list[Path]:
    """
    Discover all episode transcript.md files under base_dir/episodes or recursively.
    Returns sorted list of paths.
    """
    episodes_dir = base_dir / "episodes"
    search_dir = episodes_dir if episodes_dir.exists() else base_dir

    paths: list[Path] = []
    for root, _, files in os.walk(search_dir):
        for f in files:
            if f.lower() == "transcript.md":
                paths.append(Path(root) / f)

    paths.sort()
    return paths


def get_canonical_source_key(transcript_path: Path, base_dir: Path) -> str:
    """Compute normalized repository-relative source key (e.g. 'episodes/adam-fishman/transcript.md')."""
    try:
        rel = transcript_path.relative_to(base_dir)
        return rel.as_posix()
    except ValueError:
        # If not relative to base_dir, use the parent folder name and filename
        return f"episodes/{transcript_path.parent.name}/{transcript_path.name}"
