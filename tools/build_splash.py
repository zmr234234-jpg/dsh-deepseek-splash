"""Assemble (and optionally install) the DeepSeek launch screen for DSH Desktop.

DSH Desktop paints its own splash page while the harness boots:

    resources/splash.html        <- real file, outside app.asar, loads with ?theme=dark|light

This script renders that page from the same sources the client plugin uses, so
the launch screen and the app's own opening animation are one design. The
original page is kept next to it as a `.dsh-deepseek-splash.bak` sibling; an app
update overwrites the page, and re-running `--apply` puts it back.

Inputs :  src/desktop-splash.html (page template), src/desktop-splash.css,
          src/desktop-splash.js, src/splash.css, src/splash.js,
          assets/whale.svg (tools/trace_whale.py)

Outputs:  dist/splash.html            -> the rendered page
          <target>.dsh-deepseek-splash.bak -> the shell's own page, once

Run:  python tools/build_splash.py                 # render only
      python tools/build_splash.py --apply         # render + install
      python tools/build_splash.py --restore       # put the shell's page back
      python tools/build_splash.py --status        # say which page is installed
"""
import argparse
import os
import sys

TOOLS = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, TOOLS)
import build_client as bc  # noqa: E402  (read/js_string/whale_svg/ROOT live there)

MARKER = "dsh-deepseek-splash: launch screen"
DEFAULT_TARGET = r"D:\deepseek\Data\DSH Desktop\resources\splash.html"
BACKUP_SUFFIX = ".dsh-deepseek-splash.bak"

# Strings the desktop shell itself depends on. If one of them disappears the
# shell's boot progress (and its theme handshake) silently stops working.
CONTRACT = (
    'id="progress"',
    'id="status"',
    'id="title"',
    "location.search",
    "dataset.theme",
)


def render():
    template = bc.read("src/desktop-splash.html")
    page = template
    for token, rel in (
        ("__SPLASH_CSS__", "src/splash.css"),
        ("__FRAME_CSS__", "src/desktop-splash.css"),
    ):
        page = page.replace(token, bc.read(rel).strip())
    page = page.replace("__WHALE_SVG__", bc.js_string(bc.whale_svg()))
    for token, rel in (
        ("__RUNTIME_JS__", "src/splash.js"),
        ("__BOOT_JS__", "src/desktop-splash.js"),
    ):
        page = page.replace(token, bc.read(rel).strip())

    if "__" in page.split("<style>")[0]:
        raise SystemExit("page template left a token unsubstituted")
    for token in ("__SPLASH_CSS__", "__FRAME_CSS__", "__WHALE_SVG__", "__RUNTIME_JS__", "__BOOT_JS__"):
        if token in page:
            raise SystemExit("page template left %s unsubstituted" % token)
    for needle in CONTRACT:
        if needle not in page:
            raise SystemExit("rendered page lost the shell contract: %s" % needle)
    if "dsh-loader.gif" in page or "<img" in page:
        raise SystemExit("rendered page still pulls an external image")
    if "function mountSplash" not in page:
        raise SystemExit("rendered page has no animation runtime")
    return page


def read_text(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def write_text(path, text):
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    return len(text.encode("utf-8"))


def is_ours(path):
    try:
        return MARKER in read_text(path)
    except OSError:
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--apply", action="store_true", help="install the page into the desktop shell")
    group.add_argument("--restore", action="store_true", help="restore the shell's original page")
    group.add_argument("--status", action="store_true", help="report which page is installed")
    parser.add_argument("--target", default=DEFAULT_TARGET, help="path of the shell's splash page")
    args = parser.parse_args()

    target = args.target
    backup = target + BACKUP_SUFFIX

    if args.status:
        print("target  : %s" % target)
        print("exists  : %s" % os.path.exists(target))
        print("ours    : %s" % is_ours(target))
        print("backup  : %s (%s)" % (backup, "present" if os.path.exists(backup) else "missing"))
        return

    if args.restore:
        if not os.path.exists(backup):
            raise SystemExit("no backup at %s: nothing to restore" % backup)
        size = write_text(target, read_text(backup))
        print("restored %s from %s (%d bytes)" % (target, backup, size))
        return

    page = render()
    staged = bc.ROOT + os.sep + "dist" + os.sep + "splash.html"
    os.makedirs(os.path.dirname(staged), exist_ok=True)
    print("dist/splash.html    %7d bytes" % write_text(staged, page))
    print("whale.svg inlined   %7d bytes" % len(bc.whale_svg().encode("utf-8")))

    if not args.apply:
        print("(render only: pass --apply to install it into the shell)")
        return

    if not os.path.exists(target):
        raise SystemExit("target not found: %s" % target)
    if not os.path.exists(backup) and not is_ours(target):
        print("backup              %7d bytes -> %s" % (write_text(backup, read_text(target)), backup))
    elif not os.path.exists(backup):
        print("warning: no pristine backup exists and the installed page is already ours")
    print("installed           %7d bytes -> %s" % (write_text(target, page), target))
    print("restore with: python tools/build_splash.py --restore")


if __name__ == "__main__":
    main()
