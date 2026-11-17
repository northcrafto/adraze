#!/usr/bin/env python3
"""Sätter ihop AdrazeE2EKarna.xcframework av de statiska biblioteken, utan Xcode (bygget görs på Linux).

Simulatorns bibliotek blir en "fat"-fil (Mach-O universal: arm64 + x86_64), samma format som lipo skriver.
Användning: xcframework.py CARGO_TARGET_DIR header.h ut.xcframework
"""
import os, plistlib, shutil, struct, sys

mal, header, ut = sys.argv[1], sys.argv[2], sys.argv[3]
LIB = "libadraze_e2e.a"
MODUL = "AdrazeE2EKarna"
ARKITEKTUR = {"arm64": (0x0100000C, 0), "x86_64": (0x01000007, 3)}

def las(t):
    with open(os.path.join(mal, t, "release", LIB), "rb") as f:
        return f.read()

def fat(delar):
    """Mach-O universal: huvud (stort endian) + varje arkitektur på en 16 KiB-gräns."""
    JUSTERA = 14
    huvud = struct.pack(">II", 0xCAFEBABE, len(delar))
    pos = 8 + 20 * len(delar)
    poster, data = [], b""
    for ark, blob in delar:
        pos = (pos + (1 << JUSTERA) - 1) & ~((1 << JUSTERA) - 1)
        typ, under = ARKITEKTUR[ark]
        poster.append(struct.pack(">iiIII", typ, under, pos, len(blob), JUSTERA))
        data += b"\0" * (pos - (8 + 20 * len(delar)) - len(data)) + blob
        pos += len(blob)
    return huvud + b"".join(poster) + data

skivor = [
    ("ios-arm64", ["arm64"], None, las("aarch64-apple-ios")),
    ("ios-arm64_x86_64-simulator", ["arm64", "x86_64"], "simulator",
     fat([("arm64", las("aarch64-apple-ios-sim")), ("x86_64", las("x86_64-apple-ios"))])),
]
if os.path.exists(ut):
    shutil.rmtree(ut)
bibliotek = []
for namn, arker, variant, blob in skivor:
    d = os.path.join(ut, namn)
    os.makedirs(os.path.join(d, "Headers"))
    with open(os.path.join(d, LIB), "wb") as f:
        f.write(blob)
    shutil.copy(header, os.path.join(d, "Headers", "adraze_e2e.h"))
    with open(os.path.join(d, "Headers", "module.modulemap"), "w") as f:
        f.write(f'module {MODUL} {{\n    header "adraze_e2e.h"\n    export *\n}}\n')
    post = {"LibraryIdentifier": namn, "LibraryPath": LIB, "HeadersPath": "Headers",
            "SupportedArchitectures": arker, "SupportedPlatform": "ios"}
    if variant:
        post["SupportedPlatformVariant"] = variant
    bibliotek.append(post)
with open(os.path.join(ut, "Info.plist"), "wb") as f:
    plistlib.dump({"AvailableLibraries": bibliotek, "CFBundlePackageType": "XFWK", "XCFrameworkFormatVersion": "1.0"}, f)
for namn, _, _, blob in skivor:
    print(f"{namn}: {len(blob)} byte")
