"""설정 파일(config.yaml) 로더."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.yaml"


def load_config(config_path: str | Path | None = None) -> dict[str, Any]:
    """YAML 설정 파일을 읽어 dict로 반환한다.

    Args:
        config_path: 설정 파일 경로. None이면 기본 경로 사용.

    Returns:
        설정 딕셔너리.
    """
    path = Path(config_path) if config_path else DEFAULT_CONFIG_PATH
    if not path.exists():
        raise FileNotFoundError(f"설정 파일을 찾을 수 없습니다: {path}")

    with open(path, encoding="utf-8") as f:
        cfg: dict[str, Any] = yaml.safe_load(f)

    # 스크린샷/로그 디렉토리 자동 생성
    ss_dir = cfg.get("screenshot", {}).get("save_dir")
    if ss_dir:
        os.makedirs(ss_dir, exist_ok=True)

    log_file = cfg.get("logging", {}).get("file")
    if log_file:
        os.makedirs(os.path.dirname(log_file), exist_ok=True)

    logger.info("설정 로드 완료: %s", path)
    return cfg
