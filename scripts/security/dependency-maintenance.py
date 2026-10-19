"""Review direct JS dependency maintenance without installing packages or scripts."""

import datetime
import glob
import json
import sys
import urllib.parse
import urllib.request


def main():
    now = datetime.datetime.now(datetime.timezone.utc)
    manifests = ["package.json", "frontend/package.json", "backend/package.json"]
    manifests += sorted(glob.glob("packages/*/package.json"))
    local_names = {json.load(open(path, encoding="utf-8"))["name"] for path in manifests}
    cache = {}
    rows = []
    blocked = False
    for path in manifests:
        with open(path, encoding="utf-8") as source:
            manifest = json.load(source)
        dependencies = {}
        for group in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"):
            dependencies.update(manifest.get(group, {}))
        for name, declared in sorted(dependencies.items()):
            if name in local_names or declared.startswith(("workspace:", "file:", "link:")):
                continue
            try:
                if name not in cache:
                    url = "https://registry.npmjs.org/" + urllib.parse.quote(name, safe="")
                    with urllib.request.urlopen(url, timeout=30) as response:
                        cache[name] = json.load(response)
                metadata = cache[name]
                latest = metadata["dist-tags"]["latest"]
                published = datetime.datetime.fromisoformat(metadata["time"][latest].replace("Z", "+00:00"))
                days = (now - published).days
                deprecated = bool(metadata["versions"][latest].get("deprecated"))
                status = "BLOCK: deprecated latest release" if deprecated else (
                    "BLOCK: maintenance review overdue" if days >= 730 else (
                        "REVIEW: no stable release in a year" if days >= 365 else "OK"))
                blocked |= status.startswith("BLOCK")
                rows.append(f"| {path} | {name} | {declared} | {latest} | {days} | {status} |")
            except Exception as error:
                blocked = True
                # Do not place arbitrary registry response content in Markdown.
                rows.append(f"| {path} | {name} | - | - | - | ERROR: {type(error).__name__}; retry and investigate |")
    with open("dependency-maintenance.md", "w", encoding="utf-8") as report:
        report.write("# Dependency maintenance review\n\n")
        report.write("Reviews upstream latest stable release activity, not installed-version age. "
                     "Review resolved lockfile versions and advisories separately.\n\n")
        report.write("| Manifest | Package | Declared | Latest stable | Age (days) | Result |\n")
        report.write("| --- | --- | --- | --- | --- | --- |\n")
        report.write("\n".join(rows) + "\n")
    return int(blocked)


if __name__ == "__main__":
    sys.exit(main())
