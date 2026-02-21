"""ZeroHarm 안전 체크리스트 자동화 시나리오.

흐름:
  1. ZeroHarm 앱 실행
  2. 안전점검 메뉴 진입
  3. 체크리스트 화면 이동
  4. 모든 항목 체크 (또는 개별 설정에 따라)
  5. 제출
  6. 완료 스크린샷 저장
  7. 앱 종료
"""

from __future__ import annotations

import logging
from typing import Any

from appium.webdriver.common.appiumby import AppiumBy
from selenium.common.exceptions import NoSuchElementException

from core import AppAutomator

logger = logging.getLogger(__name__)


class ZeroHarmChecklist:
    """ZeroHarm 안전 체크리스트 자동 작성 시나리오."""

    def __init__(self, automator: AppAutomator, cfg: dict[str, Any]) -> None:
        self.auto = automator
        self.cfg = cfg
        self.checklist_cfg = cfg.get("checklist", {})

    def run(self) -> bool:
        """전체 시나리오를 실행한다. 성공 시 True를 반환한다."""
        try:
            logger.info("=" * 50)
            logger.info("ZeroHarm 안전 체크리스트 자동화 시작")
            logger.info("=" * 50)

            self.auto.start()

            self._navigate_to_checklist()
            self._fill_checklist()
            self._submit_checklist()

            logger.info("=" * 50)
            logger.info("ZeroHarm 안전 체크리스트 자동화 완료!")
            logger.info("=" * 50)
            return True

        except Exception:
            logger.exception("자동화 중 오류 발생")
            self.auto.take_screenshot("error")
            return False

        finally:
            on_complete = self.checklist_cfg.get("on_complete", {})
            if on_complete.get("close_app", True):
                self.auto.stop()

    def _navigate_to_checklist(self) -> None:
        """메뉴 경로를 따라 체크리스트 화면으로 이동한다."""
        menu_path = self.checklist_cfg.get("menu_path", [])
        logger.info("체크리스트 메뉴 탐색 시작 (단계: %d)", len(menu_path))

        for step in menu_path:
            text = step.get("text", "")
            resource_id = step.get("id", "")
            xpath = step.get("xpath", "")

            if text:
                logger.info("메뉴 탭: '%s'", text)
                try:
                    self.auto.tap_element_by_text(text)
                except NoSuchElementException:
                    # 부분 텍스트 매칭 재시도
                    logger.info("정확한 텍스트 매칭 실패, 부분 매칭 시도: '%s'", text)
                    self.auto.tap_element_by_text(text, partial=True)
            elif resource_id:
                self.auto.tap_element_by_id(resource_id)
            elif xpath:
                self.auto.tap_element_by_xpath(xpath)

            # 화면 전환 대기
            transition_wait = self.auto._timing.get("screen_transition_wait", 2)
            self.auto.wait_seconds(transition_wait)

        logger.info("체크리스트 화면 도착")

    def _fill_checklist(self) -> None:
        """체크리스트 항목들을 체크한다."""
        mode = self.checklist_cfg.get("response_mode", "check_all")
        logger.info("체크리스트 작성 모드: %s", mode)

        if mode == "check_all":
            self._check_all_items()
        elif mode == "by_config":
            self._check_items_by_config()
        else:
            logger.warning("알 수 없는 모드: %s, check_all로 대체", mode)
            self._check_all_items()

    def _check_all_items(self) -> None:
        """화면의 모든 체크박스/체크 가능 항목을 체크한다."""
        logger.info("모든 항목 체크 시작")
        checked_count = 0
        max_scrolls = 10  # 무한 스크롤 방지

        for scroll_attempt in range(max_scrolls):
            # 체크박스 요소들 찾기 (일반적인 Android 체크박스 클래스)
            checkboxes = self._find_checkable_elements()

            if not checkboxes:
                logger.info("체크 가능한 요소 없음 (스크롤 %d회차)", scroll_attempt + 1)
                if scroll_attempt == 0:
                    # 첫 시도에서 못 찾으면 다른 방식 시도
                    checkboxes = self._find_checkable_elements_alternative()

            for cb in checkboxes:
                try:
                    if not cb.get_attribute("checked") == "true":
                        cb.click()
                        checked_count += 1
                        self.auto.wait_seconds(0.3)
                except Exception:
                    logger.warning("항목 체크 실패 (건너뜀)")

            # 스크롤 전 마지막 요소 텍스트 기록
            before_source = self.auto.get_page_source()
            self.auto.scroll_down()
            self.auto.wait_seconds(1)
            after_source = self.auto.get_page_source()

            # 스크롤 후 화면이 동일하면 끝
            if before_source == after_source:
                logger.info("더 이상 스크롤할 내용 없음")
                break

        logger.info("총 %d개 항목 체크 완료", checked_count)

    def _check_items_by_config(self) -> None:
        """설정 파일의 items 목록에 따라 개별 항목을 처리한다."""
        items = self.checklist_cfg.get("items", [])
        logger.info("개별 설정에 따라 %d개 항목 처리", len(items))

        checkboxes = self._find_checkable_elements()

        for item_cfg in items:
            idx = item_cfg.get("index", 0)
            action = item_cfg.get("action", "check")

            if idx >= len(checkboxes):
                logger.warning("항목 인덱스 %d 초과 (총 %d개), 스크롤 시도", idx, len(checkboxes))
                self.auto.scroll_down()
                self.auto.wait_seconds(1)
                checkboxes = self._find_checkable_elements()
                if idx >= len(checkboxes):
                    logger.error("항목 인덱스 %d를 찾을 수 없음", idx)
                    continue

            cb = checkboxes[idx]
            is_checked = cb.get_attribute("checked") == "true"

            if action == "check" and not is_checked:
                cb.click()
                logger.info("항목 %d: 체크", idx)
            elif action == "uncheck" and is_checked:
                cb.click()
                logger.info("항목 %d: 체크 해제", idx)
            elif action == "skip":
                logger.info("항목 %d: 건너뜀", idx)

            self.auto.wait_seconds(0.3)

    def _find_checkable_elements(self) -> list:
        """체크 가능한 요소들을 찾는다."""
        selectors = [
            (AppiumBy.CLASS_NAME, "android.widget.CheckBox"),
            (AppiumBy.CLASS_NAME, "android.widget.Switch"),
            (AppiumBy.CLASS_NAME, "android.widget.ToggleButton"),
            (AppiumBy.XPATH, '//*[@checkable="true"]'),
        ]
        for by, value in selectors:
            try:
                elements = self.auto.driver.find_elements(by, value)
                if elements:
                    logger.info("체크 가능 요소 %d개 발견 (%s)", len(elements), value)
                    return elements
            except Exception:
                continue
        return []

    def _find_checkable_elements_alternative(self) -> list:
        """대체 방식으로 체크 가능한 요소들을 찾는다.

        일부 앱은 커스텀 뷰를 사용하므로 clickable + 특정 패턴으로 탐색한다.
        """
        try:
            # "적합", "양호", "Pass", "OK" 등의 버튼 찾기
            keywords = ["적합", "양호", "Pass", "OK", "Yes", "확인"]
            for kw in keywords:
                elements = self.auto.driver.find_elements(
                    AppiumBy.XPATH,
                    f'//*[@clickable="true" and contains(@text, "{kw}")]',
                )
                if elements:
                    logger.info("대체 탐색 성공: '%s' 관련 요소 %d개", kw, len(elements))
                    return elements
        except Exception:
            pass

        # 마지막 수단: 모든 clickable 요소 (리스트 내부)
        try:
            elements = self.auto.driver.find_elements(
                AppiumBy.XPATH,
                '//android.widget.ListView//*[@clickable="true"]'
                ' | //androidx.recyclerview.widget.RecyclerView'
                '//*[@clickable="true"]',
            )
            if elements:
                logger.info("리스트 내 클릭 가능 요소 %d개 발견", len(elements))
                return elements
        except Exception:
            pass

        return []

    def _submit_checklist(self) -> None:
        """체크리스트를 제출한다."""
        on_complete = self.checklist_cfg.get("on_complete", {})

        if on_complete.get("screenshot", True):
            self.auto.take_screenshot("before_submit")

        if on_complete.get("submit", True):
            submit_keywords = ["제출", "완료", "저장", "Submit", "Save", "Done", "확인"]
            submitted = False

            for kw in submit_keywords:
                try:
                    self.auto.tap_element_by_text(kw)
                    logger.info("제출 버튼 탭: '%s'", kw)
                    submitted = True
                    break
                except NoSuchElementException:
                    continue

            if not submitted:
                logger.warning("제출 버튼을 찾지 못함, 스크롤 후 재시도")
                self.auto.scroll_down()
                self.auto.wait_seconds(1)
                for kw in submit_keywords:
                    try:
                        self.auto.tap_element_by_text(kw)
                        logger.info("제출 버튼 탭 (스크롤 후): '%s'", kw)
                        submitted = True
                        break
                    except NoSuchElementException:
                        continue

            if not submitted:
                logger.error("제출 버튼을 찾을 수 없습니다")

            # 제출 확인 팝업 처리
            self.auto.wait_seconds(2)
            self._handle_confirmation_dialog()

        if on_complete.get("screenshot", True):
            self.auto.take_screenshot("after_submit")

    def _handle_confirmation_dialog(self) -> None:
        """제출 확인 팝업이 있으면 '확인' 버튼을 누른다."""
        confirm_keywords = ["확인", "예", "OK", "Yes", "네"]
        for kw in confirm_keywords:
            try:
                el = self.auto.driver.find_element(
                    AppiumBy.XPATH,
                    f'//*[@text="{kw}" and @clickable="true"]',
                )
                el.click()
                logger.info("확인 팝업 처리: '%s'", kw)
                self.auto.wait_seconds(1)
                return
            except NoSuchElementException:
                continue
        logger.info("확인 팝업 없음 (정상)")
