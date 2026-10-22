/**
 * Row sub-keys that hold an image URL. A list row that carries one of these keys
 * with a string value gets a pick control when the host supplies a pick hook.
 */
export const IMAGE_ROW_KEYS: readonly string[] = ['src', 'image', 'avatar', 'photo']

export function isImageRowKey(key: string): boolean {
  return IMAGE_ROW_KEYS.includes(key)
}
