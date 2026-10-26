export default defineEventHandler(async (event) => {
  const id = parseId(event)
  return await getEntryWithLines(id)
})