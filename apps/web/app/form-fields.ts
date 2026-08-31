/** One text value from a submitted form: a file or an absent field reads blank. */
export function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
