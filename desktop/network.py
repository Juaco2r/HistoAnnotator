from __future__ import annotations

import ipaddress
import socket


def _usable_ipv4(value: str) -> bool:
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return False

    return (
        address.version == 4
        and not address.is_loopback
        and not address.is_link_local
        and not address.is_unspecified
        and not address.is_multicast
    )


def preferred_lan_ip() -> str:
    candidates: list[str] = []

    # Ask the OS which interface it would normally use.
    # No application traffic needs to succeed.
    for target in (
        ("10.255.255.255", 1),
        ("1.1.1.1", 80),
    ):
        sock = socket.socket(
            socket.AF_INET,
            socket.SOCK_DGRAM,
        )

        try:
            sock.connect(target)
            candidates.append(
                sock.getsockname()[0]
            )
        except OSError:
            pass
        finally:
            sock.close()

    try:
        hostname = socket.gethostname()
        infos = socket.getaddrinfo(
            hostname,
            None,
            socket.AF_INET,
            socket.SOCK_STREAM,
        )
        candidates.extend(
            item[4][0]
            for item in infos
        )
    except OSError:
        pass

    for candidate in candidates:
        if _usable_ipv4(candidate):
            return candidate

    return "127.0.0.1"
