export function isGitUrl(input: string): boolean {
  return (
    input.startsWith("http://") ||
    input.startsWith("https://") ||
    input.startsWith("ssh://") ||
    input.startsWith("git@") ||
    input.endsWith(".git")
  );
}

export function sanitizeName(input: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(input)) {
    throw new Error(`Invalid name: '${input}'`);
  }

  return input;
}
