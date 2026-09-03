export function insertIntoList(list, field, beforeKey) {
  if (beforeKey) {
    const index = list.findIndex((entry) => entry.key === beforeKey)
    list.splice(index < 0 ? list.length : index, 0, field)
    return
  }
  list.push(field)
}

export function insertAfterKey(list, field, afterKey) {
  if (!afterKey) {
    list.push(field)
    return
  }
  const index = list.findIndex((entry) => entry.key === afterKey)
  list.splice(index < 0 ? list.length : index + 1, 0, field)
}
