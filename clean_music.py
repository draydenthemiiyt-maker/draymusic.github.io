import xml.etree.ElementTree as ET
from pathlib import Path

path = Path('music.xml')
tree = ET.parse(path)
root = tree.getroot()

songs = list(root.findall('song'))
seen = set()
kept = []
removed_missing = 0
removed_duplicate = 0

for song in songs:
    title = (song.findtext('title') or '').strip()
    artist = (song.findtext('artist') or '').strip()
    url = (song.findtext('url') or '').strip()
    key = (title.lower(), artist.lower())

    if not url:
        removed_missing += 1
        continue

    if key in seen:
        removed_duplicate += 1
        continue

    seen.add(key)
    kept.append(song)

new_root = ET.Element('music')
for song in kept:
    new_root.append(song)

ET.indent(new_root, space='  ')
new_tree = ET.ElementTree(new_root)
with path.open('wb') as fh:
    new_tree.write(fh, encoding='utf-8', xml_declaration=True)

print(f'original songs: {len(songs)}')
print(f'kept songs: {len(kept)}')
print(f'removed missing URL: {removed_missing}')
print(f'removed duplicates: {removed_duplicate}')
