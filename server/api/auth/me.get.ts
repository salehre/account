export default defineEventHandler((event) => {
  const { id, username, fullName, role, permissions } = getCurrentUser(event)
  return { id, username, fullName, role, permissions }
})