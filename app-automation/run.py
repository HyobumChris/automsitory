#!/usr/bin/env python3
"""원터치 실행 스크립트.

사용법:
    python run.py                    # 기본 config.yaml 사용
    python run.py -c my_config.yaml  # 커스텀 설정 파일 사용
    python run.py --dry-run          # 실제 실행 없이 설정 확인만
    python run.py --dump-ui          # 현재 화면 XML 덤프 (디버깅)
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

# 모듈 경로 설정
sys.path.insert(0, str(Path(__file__).resolve().parent))

from utils.config_loader import load_config
from utils.logger_setup import setup_logging
from core import AppAutomator
from scenarios.zeroharm_checklist import ZeroHarmChecklist

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="ZeroHarm 안전 체크리스트 원터치 자동화",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
예시:
  python run.py                     기본 설정으로 실행
  python run.py -c custom.yaml      커스텀 설정 파일 사용
  python run.py --dry-run            설정만 확인 (실행 안 함)
  python run.py --dump-ui            현재 화면 UI 구조 덤프
        """,
    )
    parser.add_argument(
        "-c", "--config",
        type=str,
        default=None,
        help="설정 파일 경로 (기본: config.yaml)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="설정 파일 유효성만 확인하고 종료",
    )
    parser.add_argument(
        "--dump-ui",
        action="store_true",
        help="앱을 열고 현재 화면 XML을 출력 (UI 요소 분석용)",
    )
    return parser.parse_args()


def dry_run(cfg: dict) -> None:
    """설정 파일 내용을 확인만 하고 종료한다."""
    print("\n[Dry Run] 설정 파일 확인:")
    print(f"  Appium 서버: {cfg['appium']['host']}:{cfg['appium']['port']}")
    print(f"  디바이스: {cfg['device']['device_name']}")
    print(f"  앱 패키지: {cfg['app']['package']}")
    print(f"  앱 액티비티: {cfg['app']['activity']}")
    print(f"  체크리스트 모드: {cfg['checklist']['response_mode']}")
    menu_texts = [s.get("text", s.get("id", "?")) for s in cfg["checklist"]["menu_path"]]
    print(f"  메뉴 경로: {' → '.join(menu_texts)}")
    print(f"  완료 후 제출: {cfg['checklist']['on_complete']['submit']}")
    print(f"  완료 후 스크린샷: {cfg['checklist']['on_complete']['screenshot']}")
    print(f"  완료 후 앱 종료: {cfg['checklist']['on_complete']['close_app']}")
    print("\n[OK] 설정 파일이 정상입니다. --dry-run 플래그를 제거하고 실행하세요.")


def dump_ui(cfg: dict) -> None:
    """앱을 열고 현재 화면의 UI 구조를 덤프한다."""
    automator = AppAutomator(cfg)
    try:
        automator.start()
        source = automator.get_page_source()

        dump_path = Path("ui_dump.xml")
        dump_path.write_text(source, encoding="utf-8")
        print(f"\n[UI 덤프] 저장 완료: {dump_path.absolute()}")
        print("이 파일을 열어 UI 요소의 텍스트, ID, XPath 등을 확인하세요.")
        print("config.yaml의 menu_path를 이 정보로 업데이트할 수 있습니다.")
    finally:
        automator.stop()


def main() -> None:
    args = parse_args()

    cfg = load_config(args.config)
    setup_logging(cfg)

    print("=" * 50)
    print("  ZeroHarm 안전 체크리스트 원터치 자동화")
    print("=" * 50)

    if args.dry_run:
        dry_run(cfg)
        return

    if args.dump_ui:
        dump_ui(cfg)
        return

    automator = AppAutomator(cfg)
    scenario = ZeroHarmChecklist(automator, cfg)

    success = scenario.run()

    if success:
        print("\n✓ 자동화 완료!")
    else:
        print("\n✗ 자동화 실패. 로그를 확인하세요.")
        sys.exit(1)


if __name__ == "__main__":
    main()
