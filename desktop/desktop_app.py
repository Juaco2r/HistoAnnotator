from __future__ import annotations

import io
import sys
from pathlib import Path

import qrcode
from PySide6.QtCore import (
    QTimer,
    QUrl,
    Qt,
)
from PySide6.QtGui import (
    QAction,
    QCloseEvent,
    QDesktopServices,
    QPixmap,
)
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QFileDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSplitter,
    QVBoxLayout,
)
from PySide6.QtWebEngineWidgets import (
    QWebEngineView,
)

from .config import (
    load_config,
    save_config,
)
from .network import (
    preferred_lan_ip,
)
from .server_control import (
    ServerController,
)

DESKTOP_VERSION = "1.2.0-rc1"


def project_root() -> Path:
    return (
        Path(__file__)
        .resolve()
        .parents[1]
    )


class ServerPanel(QFrame):
    def __init__(
        self,
        owner: "DesktopWindow",
    ) -> None:
        super().__init__()

        self.owner = owner

        self.setFrameShape(
            QFrame.StyledPanel
        )

        layout = QVBoxLayout(self)

        title = QLabel(
            "HistoAnnotator Server"
        )
        title.setStyleSheet(
            "font-size: 18px; "
            "font-weight: 600;"
        )
        layout.addWidget(title)

        self.status_label = QLabel(
            "● Desktop local mode"
        )
        layout.addWidget(
            self.status_label
        )

        layout.addWidget(
            QLabel(
                "Address / IP shown in QR"
            )
        )

        address_row = QHBoxLayout()

        self.advertised_host = QLineEdit()
        self.advertised_host.setPlaceholderText(
            "Auto-detected local IP"
        )
        self.advertised_host.editingFinished.connect(
            owner.advertised_host_changed
        )
        address_row.addWidget(
            self.advertised_host
        )

        self.detect_button = QPushButton(
            "Use detected"
        )
        self.detect_button.clicked.connect(
            owner.use_detected_host
        )
        address_row.addWidget(
            self.detect_button
        )

        layout.addLayout(
            address_row
        )

        layout.addWidget(
            QLabel(
                "Android / browser URL"
            )
        )

        self.network_url = QLineEdit()
        self.network_url.setReadOnly(
            True
        )
        layout.addWidget(
            self.network_url
        )

        self.qr_label = QLabel()
        self.qr_label.setAlignment(
            Qt.AlignCenter
        )
        self.qr_label.setMinimumSize(
            220,
            220,
        )
        layout.addWidget(
            self.qr_label
        )

        buttons = QHBoxLayout()

        self.share_button = QPushButton(
            "Start Server"
        )
        self.share_button.clicked.connect(
            owner.toggle_sharing
        )
        buttons.addWidget(
            self.share_button
        )

        self.copy_button = QPushButton(
            "Copy address"
        )
        self.copy_button.clicked.connect(
            owner.copy_network_url
        )
        buttons.addWidget(
            self.copy_button
        )

        self.browser_button = QPushButton(
            "Open in browser"
        )
        self.browser_button.clicked.connect(
            owner.open_network_browser
        )
        buttons.addWidget(
            self.browser_button
        )

        layout.addLayout(
            buttons
        )

        self.keep_running = QCheckBox(
            "Keep server running when "
            "HistoAnnotator Desktop closes"
        )
        self.keep_running.toggled.connect(
            owner.keep_running_changed
        )
        layout.addWidget(
            self.keep_running
        )

        firewall_note = QLabel(
            "On Windows, allow HistoAnnotator "
            "through Private networks if the "
            "firewall prompt appears."
        )
        firewall_note.setWordWrap(True)
        layout.addWidget(
            firewall_note
        )

        discovery_note = QLabel(
            "No automatic discovery is used. "
            "Android: File → Connection settings → Scan QR. Browsers can use the explicit URL."
        )
        discovery_note.setWordWrap(
            True
        )
        layout.addWidget(
            discovery_note
        )

        layout.addStretch(1)


class DesktopWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()

        self.config = load_config()

        self.controller = (
            ServerController(
                project_root()
            )
        )

        self.detected_ip = (
            preferred_lan_ip()
        )

        self.setWindowTitle(
            "HistoAnnotator Desktop "
            f"{DESKTOP_VERSION}"
        )
        self.resize(
            1500,
            950,
        )

        self.web = QWebEngineView()
        self.server_panel = (
            ServerPanel(self)
        )

        splitter = QSplitter(
            Qt.Horizontal
        )
        splitter.addWidget(
            self.web
        )
        splitter.addWidget(
            self.server_panel
        )
        splitter.setStretchFactor(
            0,
            1,
        )
        splitter.setStretchFactor(
            1,
            0,
        )

        self.setCentralWidget(
            splitter
        )

        self._build_menu()

        self.poll_timer = QTimer(
            self
        )
        self.poll_timer.setInterval(
            2000
        )
        self.poll_timer.timeout.connect(
            self.refresh_server_ui
        )
        self.poll_timer.start()

        self.ensure_workspace()
        self.ensure_backend()
        self.refresh_server_ui()
        self.load_desktop_view()

    def _build_menu(self) -> None:
        menu = (
            self.menuBar()
            .addMenu(
                "Desktop"
            )
        )

        choose_images = QAction(
            "Choose image folder…",
            self,
        )
        choose_images.triggered.connect(
            self.choose_image_folder
        )
        menu.addAction(
            choose_images
        )

        choose_data = QAction(
            "Choose data folder…",
            self,
        )
        choose_data.triggered.connect(
            self.choose_data_folder
        )
        menu.addAction(
            choose_data
        )

        menu.addSeparator()

        show_server = QAction(
            "Show server panel",
            self,
        )
        show_server.triggered.connect(
            self.server_panel.show
        )
        menu.addAction(
            show_server
        )

    def ensure_workspace(self) -> None:
        if self.config.image_root:
            current = (
                Path(
                    self.config.image_root
                )
                .expanduser()
            )

            if current.is_dir():
                return

        QMessageBox.information(
            self,
            "HistoAnnotator Desktop",
            (
                "Choose the folder containing "
                "the images for this Windows "
                "HistoAnnotator session."
            ),
        )

        self.choose_image_folder(
            restart=False
        )

        if not self.config.image_root:
            raise SystemExit(
                "No image folder selected."
            )

    def ensure_backend(self) -> None:
        if self.controller.health(
            self.config.port
        ):
            return

        try:
            self.controller.start(
                self.config
            )
        except Exception as error:
            QMessageBox.critical(
                self,
                "Could not start HistoAnnotator",
                str(error),
            )
            raise

    def local_url(self) -> str:
        return (
            f"http://127.0.0.1:"
            f"{self.config.port}"
        )

    def advertised_host_value(
        self,
    ) -> str:
        configured = str(
            self.config.advertised_host
            or ""
        ).strip()

        return (
            configured
            or self.detected_ip
        )

    def network_url_value(
        self,
    ) -> str:
        return (
            "http://"
            f"{self.advertised_host_value()}:"
            f"{self.config.port}"
        )

    def load_desktop_view(
        self,
    ) -> None:
        self.web.setUrl(
            QUrl(
                self.local_url()
                + "/"
            )
        )

    def render_qr(
        self,
        value: str,
    ) -> None:
        image = qrcode.make(
            value
        )

        buffer = io.BytesIO()

        image.save(
            buffer,
            format="PNG",
        )

        pixmap = QPixmap()
        pixmap.loadFromData(
            buffer.getvalue(),
            "PNG",
        )

        self.server_panel.qr_label.setPixmap(
            pixmap.scaled(
                210,
                210,
                Qt.KeepAspectRatio,
                Qt.SmoothTransformation,
            )
        )

    def refresh_server_ui(
        self,
    ) -> None:
        active = bool(
            self.controller.health(
                self.config.port
            )
        )

        self.server_panel.keep_running.blockSignals(
            True
        )
        self.server_panel.keep_running.setChecked(
            self.config.keep_server_running
        )
        self.server_panel.keep_running.blockSignals(
            False
        )

        self.server_panel.advertised_host.blockSignals(
            True
        )
        self.server_panel.advertised_host.setText(
            self.advertised_host_value()
        )
        self.server_panel.advertised_host.blockSignals(
            False
        )

        if not active:
            self.server_panel.status_label.setText(
                "● Server stopped"
            )
            self.server_panel.share_button.setText(
                "Start Server"
            )
            self.server_panel.network_url.clear()
            self.server_panel.qr_label.clear()
            return

        runtime = (
            self.controller
            .read_runtime()
        )

        shared = bool(
            runtime.get(
                "share_lan",
                False,
            )
        )

        self.config.share_lan = (
            shared
        )

        if shared:
            url = (
                self.network_url_value()
            )

            self.server_panel.status_label.setText(
                "● Server running on network"
            )
            self.server_panel.share_button.setText(
                "Stop sharing"
            )
            self.server_panel.network_url.setText(
                url
            )
            self.render_qr(
                url
            )
        else:
            self.server_panel.status_label.setText(
                "● Desktop local mode"
            )
            self.server_panel.share_button.setText(
                "Start Server"
            )
            self.server_panel.network_url.setText(
                "Not shared"
            )
            self.server_panel.qr_label.clear()

    def restart_backend(
        self,
    ) -> None:
        try:
            self.controller.restart(
                self.config
            )

            self.load_desktop_view()
            self.refresh_server_ui()
        except Exception as error:
            QMessageBox.critical(
                self,
                "Server restart failed",
                str(error),
            )

    def choose_image_folder(
        self,
        checked: bool = False,
        restart: bool = True,
    ) -> None:
        initial = (
            self.config.image_root
            or str(Path.home())
        )

        selected = (
            QFileDialog
            .getExistingDirectory(
                self,
                "Choose HistoAnnotator image folder",
                initial,
            )
        )

        if not selected:
            return

        self.config.image_root = (
            selected
        )

        save_config(
            self.config
        )

        if restart:
            self.restart_backend()

    def choose_data_folder(
        self,
    ) -> None:
        selected = (
            QFileDialog
            .getExistingDirectory(
                self,
                "Choose HistoAnnotator data folder",
                self.config.data_root,
            )
        )

        if not selected:
            return

        self.config.data_root = (
            selected
        )

        save_config(
            self.config
        )

        self.restart_backend()

    def advertised_host_changed(
        self,
    ) -> None:
        value = (
            self.server_panel
            .advertised_host
            .text()
            .strip()
        )

        if value == self.detected_ip:
            value = ""

        self.config.advertised_host = (
            value
        )

        save_config(
            self.config
        )

        self.refresh_server_ui()

    def use_detected_host(
        self,
    ) -> None:
        self.detected_ip = (
            preferred_lan_ip()
        )
        self.config.advertised_host = ""
        save_config(
            self.config
        )
        self.refresh_server_ui()

    def toggle_sharing(
        self,
    ) -> None:
        self.config.share_lan = (
            not self.config.share_lan
        )

        save_config(
            self.config
        )

        self.restart_backend()

    def keep_running_changed(
        self,
        checked: bool,
    ) -> None:
        self.config.keep_server_running = (
            bool(checked)
        )
        save_config(
            self.config
        )

    def copy_network_url(
        self,
    ) -> None:
        if not self.config.share_lan:
            return

        QApplication.clipboard().setText(
            self.network_url_value()
        )

    def open_network_browser(
        self,
    ) -> None:
        if not self.config.share_lan:
            return

        QDesktopServices.openUrl(
            QUrl(
                self.network_url_value()
            )
        )

    def closeEvent(
        self,
        event: QCloseEvent,
    ) -> None:
        if (
            self.config.share_lan
            and self.config.keep_server_running
        ):
            event.accept()
            return

        try:
            self.controller.stop(
                self.config.port
            )
        except Exception:
            pass

        event.accept()


def run_desktop() -> int:
    app = QApplication(
        sys.argv
    )

    app.setApplicationName(
        "HistoAnnotator Desktop"
    )

    window = DesktopWindow()
    window.show()

    return app.exec()
