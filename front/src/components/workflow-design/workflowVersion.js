export function versionTitle(version) {
  return `流程版本 (V${version})`
}

export function sortVersions(rows) {
  return [...(rows || [])].sort((a, b) => {
    if (Boolean(a.enabled) !== Boolean(b.enabled)) return a.enabled ? -1 : 1
    return b.version - a.version
  })
}
