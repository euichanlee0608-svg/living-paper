"""Generate QR reference matrices with the Python `qrcode` library.

src/ui/components/qr.js is checked module-for-module against this file by
tests/qr.verify.html. Each case is emitted at every mask so the comparison
is exact rather than dependent on both sides picking the same mask.

    pip install qrcode
    python tests/gen-qr-reference.py
"""
import json
import qrcode
from qrcode.constants import ERROR_CORRECT_M
from qrcode.util import QRData, MODE_8BIT_BYTE


def byte_segment(text):
    """Force byte mode. Left to itself the library upgrades all-uppercase
    strings to the denser alphanumeric mode, which our encoder does not
    implement — so the reference has to be pinned to the same mode."""
    return QRData(text.encode("utf-8"), mode=MODE_8BIT_BYTE, check_data=False)

CASES = [
    "HELLO",
    "https://euichanlee0608-svg.github.io/living-paper/",
    "lp1:join:lab_kumc_mfx:AbCdEfGhIjKlMnOpQrStUv",
    json.dumps({"v": 1, "lab": "lab_kumc_mfx", "kid": "K7x2QpLm9vZaBc1dEfGh",
                "relay": "https://relay.example.workers.dev"}, separators=(",", ":")),
    "a" * 300,
]


def matrix_at(text, version, mask):
    q = qrcode.QRCode(version=version, error_correction=ERROR_CORRECT_M,
                      box_size=1, border=0, mask_pattern=mask)
    q.add_data(byte_segment(text))
    q.make(fit=False)
    return ["".join("1" if c else "0" for c in row) for row in q.get_matrix()]


out = []
for text in CASES:
    probe = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=1, border=0)
    probe.add_data(byte_segment(text))
    probe.make(fit=True)
    version = probe.version
    out.append({
        "text": text,
        "version": version,
        "masks": {str(m): matrix_at(text, version, m) for m in range(8)},
    })

with open("tests/qr-reference.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("wrote tests/qr-reference.json:", len(out), "cases, versions",
      [c["version"] for c in out])
