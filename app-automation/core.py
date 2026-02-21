"""Appium 자동화 코어 엔진.

Android 앱 실행 → 조작 → 종료 흐름을 제어한다.
"""

from __future__ import annotations

import datetime
import logging
import time
from pathlib import Path
from typing import Any

from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.webdriver.common.appiumby import AppiumBy
from selenium.common.exceptions import (
    NoSuchElementException,
    TimeoutException,
)
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

logger = logging.getLogger(__name__)


class AppAutomator:
    """Android 앱 자동화 엔진.

    사용 예::

        automator = AppAutomator(config)
        automator.start()
        automator.tap_element_by_text("안전점검")
        automator.stop()
    """

    def __init__(self, cfg: dict[str, Any]) -> None:
        self.cfg = cfg
        self.driver: webdriver.Remote | None = None
        self._timing = cfg.get("timing", {})

    # ──────────────────────────────────────────────
    # 라이프사이클
    # ──────────────────────────────────────────────

    def start(self) -> None:
        """Appium 드라이버를 시작하고 앱을 실행한다."""
        appium_cfg = self.cfg.get("appium", {})
        device_cfg = self.cfg.get("device", {})
        app_cfg = self.cfg.get("app", {})

        options = UiAutomator2Options()
        options.platform_name = device_cfg.get("platform_name", "Android")
        options.device_name = device_cfg.get("device_name", "emulator-5554")
        options.platform_version = str(device_cfg.get("platform_version", "13"))
        options.automation_name = device_cfg.get("automation_name", "UiAutomator2")
        options.no_reset = device_cfg.get("no_reset", True)
        options.app_package = app_cfg.get("package", "")
        options.app_activity = app_cfg.get("activity", "")

        server_url = (
            f"http://{appium_cfg.get('host', '127.0.0.1')}"
            f":{appium_cfg.get('port', 4723)}"
        )

        logger.info("Appium 서버 연결: %s", server_url)
        self.driver = webdriver.Remote(server_url, options=options)

        implicit_wait = self._timing.get("implicit_wait", 10)
        self.driver.implicitly_wait(implicit_wait)

        launch_wait = self._timing.get("app_launch_wait", 5)
        logger.info("앱 실행 대기: %d초", launch_wait)
        time.sleep(launch_wait)
        logger.info("앱 실행 완료: %s", app_cfg.get("package"))

    def stop(self) -> None:
        """앱을 종료하고 드라이버를 정리한다."""
        if self.driver:
            try:
                pkg = self.cfg.get("app", {}).get("package", "")
                if pkg:
                    self.driver.terminate_app(pkg)
                    logger.info("앱 종료: %s", pkg)
            except Exception:
                logger.warning("앱 종료 중 예외 발생 (무시)")
            finally:
                self.driver.quit()
                self.driver = None
                logger.info("드라이버 종료 완료")

    # ──────────────────────────────────────────────
    # 요소 탐색
    # ──────────────────────────────────────────────

    def find_by_text(self, text: str, partial: bool = False):
        """화면에서 텍스트로 요소를 찾는다."""
        self._ensure_driver()
        if partial:
            xpath = f'//*[contains(@text, "{text}")]'
        else:
            xpath = f'//*[@text="{text}"]'
        return self.driver.find_element(AppiumBy.XPATH, xpath)

    def find_by_id(self, resource_id: str):
        """리소스 ID로 요소를 찾는다."""
        self._ensure_driver()
        return self.driver.find_element(AppiumBy.ID, resource_id)

    def find_by_xpath(self, xpath: str):
        """XPath로 요소를 찾는다."""
        self._ensure_driver()
        return self.driver.find_element(AppiumBy.XPATH, xpath)

    def find_all_by_class(self, class_name: str):
        """클래스명으로 모든 요소를 찾는다."""
        self._ensure_driver()
        return self.driver.find_elements(AppiumBy.CLASS_NAME, class_name)

    def wait_for_element(self, by: str, value: str, timeout: int | None = None):
        """요소가 나타날 때까지 대기한다."""
        self._ensure_driver()
        wait_sec = timeout or self._timing.get("explicit_wait", 15)
        wait = WebDriverWait(self.driver, wait_sec)
        return wait.until(EC.presence_of_element_located((by, value)))

    def wait_for_text(self, text: str, timeout: int | None = None):
        """특정 텍스트가 화면에 나타날 때까지 대기한다."""
        xpath = f'//*[@text="{text}"]'
        return self.wait_for_element(AppiumBy.XPATH, xpath, timeout)

    # ──────────────────────────────────────────────
    # 조작
    # ──────────────────────────────────────────────

    def tap_element_by_text(self, text: str, partial: bool = False) -> None:
        """텍스트로 요소를 찾아 탭한다."""
        el = self.find_by_text(text, partial=partial)
        el.click()
        logger.info("탭: '%s'", text)
        self._wait_after_click()

    def tap_element_by_id(self, resource_id: str) -> None:
        """리소스 ID로 요소를 찾아 탭한다."""
        el = self.find_by_id(resource_id)
        el.click()
        logger.info("탭(ID): '%s'", resource_id)
        self._wait_after_click()

    def tap_element_by_xpath(self, xpath: str) -> None:
        """XPath로 요소를 찾아 탭한다."""
        el = self.find_by_xpath(xpath)
        el.click()
        logger.info("탭(XPath): '%s'", xpath)
        self._wait_after_click()

    def input_text(self, resource_id: str, text: str) -> None:
        """입력 필드에 텍스트를 입력한다."""
        el = self.find_by_id(resource_id)
        el.clear()
        el.send_keys(text)
        logger.info("입력(ID=%s): '%s'", resource_id, text)

    def scroll_down(self) -> None:
        """화면을 아래로 스크롤한다."""
        self._ensure_driver()
        size = self.driver.get_window_size()
        start_x = size["width"] // 2
        start_y = int(size["height"] * 0.8)
        end_y = int(size["height"] * 0.2)
        self.driver.swipe(start_x, start_y, start_x, end_y, duration=800)
        logger.info("스크롤 다운")

    def scroll_up(self) -> None:
        """화면을 위로 스크롤한다."""
        self._ensure_driver()
        size = self.driver.get_window_size()
        start_x = size["width"] // 2
        start_y = int(size["height"] * 0.2)
        end_y = int(size["height"] * 0.8)
        self.driver.swipe(start_x, start_y, start_x, end_y, duration=800)
        logger.info("스크롤 업")

    def go_back(self) -> None:
        """Android 뒤로가기 버튼을 누른다."""
        self._ensure_driver()
        self.driver.back()
        logger.info("뒤로가기")
        self._wait_after_click()

    # ──────────────────────────────────────────────
    # 유틸리티
    # ──────────────────────────────────────────────

    def take_screenshot(self, tag: str = "") -> str | None:
        """스크린샷을 저장하고 파일 경로를 반환한다."""
        ss_cfg = self.cfg.get("screenshot", {})
        if not ss_cfg.get("enabled", True):
            return None

        self._ensure_driver()
        save_dir = Path(ss_cfg.get("save_dir", "./screenshots"))
        save_dir.mkdir(parents=True, exist_ok=True)

        fmt = ss_cfg.get("filename_format", "screenshot_%Y%m%d_%H%M%S.png")
        filename = datetime.datetime.now().strftime(fmt)
        if tag:
            stem, ext = filename.rsplit(".", 1)
            filename = f"{stem}_{tag}.{ext}"

        filepath = save_dir / filename
        self.driver.save_screenshot(str(filepath))
        logger.info("스크린샷 저장: %s", filepath)
        return str(filepath)

    def is_element_present(self, by: str, value: str) -> bool:
        """요소가 화면에 존재하는지 확인한다."""
        self._ensure_driver()
        try:
            self.driver.find_element(by, value)
            return True
        except NoSuchElementException:
            return False

    def get_page_source(self) -> str:
        """현재 화면의 XML 소스를 반환한다 (디버깅용)."""
        self._ensure_driver()
        return self.driver.page_source

    def wait_seconds(self, seconds: float) -> None:
        """지정된 시간만큼 대기한다."""
        time.sleep(seconds)

    # ──────────────────────────────────────────────
    # 내부 메서드
    # ──────────────────────────────────────────────

    def _ensure_driver(self) -> None:
        if self.driver is None:
            raise RuntimeError("드라이버가 시작되지 않았습니다. start()를 먼저 호출하세요.")

    def _wait_after_click(self) -> None:
        wait = self._timing.get("after_click_wait", 1)
        time.sleep(wait)
