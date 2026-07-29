"""Build the Continuum-120 timeline inside DaVinci Resolve from cutlist.json.

Run it from Resolve's own console (Workspace -> Console -> Py3):

    exec(open("/Users/mukilan/Desktop/promotheus/apps/video/resolve/build_timeline.py").read())

This is conform path 2 of 3 (PLAN Section 6). The free version of Resolve does
not expose external scripting, so this script only works from inside the app.
Path 1 is importing out/conform/continuum-120.fcpxml; path 3 is the record-TC
table in out/conform/cutlist.md.

Dry-run it anywhere, with no Resolve at all, to see exactly what it would do:

    RESOLVE_DRY=1 python3 resolve/build_timeline.py
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CUTLIST = os.path.join(ROOT, "cutlist.json")

PROJECT_NAME = "Continuum-120"
TIMELINE_NAME = "Continuum-120 v1"

# Resolve track indices are 1-based per type. Video 1 carries picture, video 2
# the alpha overlays; audio 1 is voiceover, audio 2 the music bed.
TRACK_INDEX = {"V1": 1, "V2": 2, "A1": 1, "A2": 2}
TRACK_TYPE = {"V1": "video", "V2": "video", "A1": "audio", "A2": "audio"}

BINS = {
    "remotion": "01_remotion",
    "capture": "02_capture",
    "overlay": "03_overlays",
    "audio": "04_audio",
}

DRY = os.environ.get("RESOLVE_DRY") == "1"


def log(message):
    print(message)


def load_cutlist():
    with open(CUTLIST, "r", encoding="utf-8") as handle:
        return json.load(handle)


def get_resolve():
    """Resolve injects `resolve` into its console; fall back to the module."""
    if "resolve" in globals():
        return globals()["resolve"]
    builtin = getattr(sys.modules.get("__main__"), "resolve", None)
    if builtin is not None:
        return builtin
    try:
        import DaVinciResolveScript as dvr  # type: ignore

        return dvr.scriptapp("Resolve")
    except Exception:
        return None


def group_events(cutlist):
    """Bucket events by bin, preserving timeline order within each bucket."""
    grouped = {name: [] for name in BINS.values()}
    for event in cutlist["events"]:
        grouped[BINS[event["kind"]]].append(event)
    return grouped


def plan(cutlist):
    """The exact clip plan, printed identically in dry-run and live modes."""
    rows = []
    for event in cutlist["events"]:
        duration = event["recOut"] - event["recIn"]
        rows.append(
            {
                "id": event["id"],
                "track": event["track"],
                "trackIndex": TRACK_INDEX[event["track"]],
                "trackType": TRACK_TYPE[event["track"]],
                "src": event["src"],
                "startFrame": event["srcIn"],
                "endFrame": event["srcIn"] + duration - 1,
                "recordFrame": event["recIn"],
                "frames": duration,
                "offline": event["offline"],
            }
        )
    return rows


def print_plan(rows, cutlist):
    log("")
    log("  %-16s %-5s %-6s %8s %8s %8s  %s" % ("id", "trk", "idx", "src in", "src out", "rec at", "source"))
    log("  " + "-" * 96)
    for row in rows:
        log(
            "  %-16s %-5s %-6s %8d %8d %8d  %s%s"
            % (
                row["id"],
                row["track"],
                row["trackIndex"],
                row["startFrame"],
                row["endFrame"],
                row["recordFrame"],
                row["src"],
                "  [OFFLINE]" if row["offline"] else "",
            )
        )
    log("")
    log("  %d clips, %d frames, %d fps" % (len(rows), cutlist["totalFrames"], cutlist["fps"]))


def build(cutlist, rows):
    app = get_resolve()
    if app is None:
        log("")
        log("! No Resolve API found.")
        log("  Run this from Resolve: Workspace -> Console -> Py3, then")
        log('  exec(open("%s").read())' % os.path.join(HERE, "build_timeline.py"))
        log("  Or import out/conform/continuum-120.fcpxml (File -> Import -> Timeline).")
        return False

    manager = app.GetProjectManager()
    project = manager.CreateProject(PROJECT_NAME) or manager.LoadProject(PROJECT_NAME)
    if project is None:
        log("! Could not create or open project %s" % PROJECT_NAME)
        return False

    # Format must be set before any media lands, or Resolve conforms the
    # timeline to the first clip it sees instead of to the master format.
    project.SetSetting("timelineResolutionWidth", str(cutlist["width"]))
    project.SetSetting("timelineResolutionHeight", str(cutlist["height"]))
    project.SetSetting("timelineFrameRate", str(cutlist["fps"]))
    project.SetSetting("timelinePlaybackFrameRate", str(cutlist["fps"]))
    project.SetSetting("colorScienceMode", "davinciYRGBColorManagedv2")
    project.SetSetting("timelineColorSpaceOutput", "Rec.709 Gamma 2.4")

    media_pool = project.GetMediaPool()
    root_folder = media_pool.GetRootFolder()

    existing = {folder.GetName(): folder for folder in root_folder.GetSubFolderList()}
    folders = {}
    for bin_name in BINS.values():
        folders[bin_name] = existing.get(bin_name) or media_pool.AddSubFolder(root_folder, bin_name)

    storage = app.GetMediaStorage()
    imported = {}
    for bin_name, events in group_events(cutlist).items():
        paths = []
        for event in events:
            absolute = os.path.join(ROOT, event["src"])
            if os.path.exists(absolute) and absolute not in paths:
                paths.append(absolute)
        if not paths:
            continue
        media_pool.SetCurrentFolder(folders[bin_name])
        items = storage.AddItemListToMediaPool(paths) or []
        for item in items:
            imported[item.GetClipProperty("File Path")] = item
        log("  imported %d clip(s) into %s" % (len(items), bin_name))

    timeline = media_pool.CreateEmptyTimeline(TIMELINE_NAME)
    if timeline is None:
        log("! Could not create timeline %s" % TIMELINE_NAME)
        return False

    while timeline.GetTrackCount("video") < 2:
        timeline.AddTrack("video")
    while timeline.GetTrackCount("audio") < 2:
        timeline.AddTrack("audio")

    clips = []
    missing = []
    for row in rows:
        absolute = os.path.join(ROOT, row["src"])
        item = imported.get(absolute)
        if item is None:
            missing.append(row["id"])
            continue
        clips.append(
            {
                "mediaPoolItem": item,
                "startFrame": row["startFrame"],
                "endFrame": row["endFrame"],
                "trackIndex": row["trackIndex"],
                "recordFrame": row["recordFrame"],
                "mediaType": 1 if row["trackType"] == "video" else 2,
            }
        )

    appended = media_pool.AppendToTimeline(clips)
    log("  appended %d/%d clips" % (len(appended or []), len(rows)))
    if missing:
        log("  %d clip(s) skipped (source not on disk yet): %s" % (len(missing), ", ".join(missing)))
        log("  Shoot Phase B, then re-run — or relink in the media pool.")

    add_render_presets(project)
    return True


def add_render_presets(project):
    """Queue the two deliverables from PLAN Section 6."""
    out_dir = os.path.join(ROOT, "out", "deliver")
    os.makedirs(out_dir, exist_ok=True)

    project.SetRenderSettings(
        {
            "TargetDir": out_dir,
            "CustomName": "Continuum-120_master",
            "FormatWidth": 1920,
            "FormatHeight": 1080,
            "FrameRate": "30",
        }
    )
    project.SetCurrentRenderFormatAndCodec("mov", "ProRes422HQ")
    project.AddRenderJob()

    project.SetRenderSettings(
        {
            "TargetDir": out_dir,
            "CustomName": "Continuum-120_upload",
            "FormatWidth": 1920,
            "FormatHeight": 1080,
            "FrameRate": "30",
        }
    )
    project.SetCurrentRenderFormatAndCodec("mp4", "H264")
    project.AddRenderJob()
    log("  queued 2 render jobs -> out/deliver/")


def main():
    cutlist = load_cutlist()
    rows = plan(cutlist)

    log("Continuum-120 timeline build%s" % ("  [DRY RUN]" if DRY else ""))
    print_plan(rows, cutlist)

    offline = [row for row in rows if row["offline"]]
    if offline:
        log("")
        log("  %d source(s) not yet on disk (Phase B captures):" % len(offline))
        for row in offline:
            log("      %s" % row["src"])

    if DRY:
        log("")
        log("  Dry run — nothing was written. Unset RESOLVE_DRY and run inside Resolve to build.")
        return

    if build(cutlist, rows):
        log("")
        log("Done. Verify: 3600-frame timeline, V2 overlays present, A1/A2 present.")


main()
