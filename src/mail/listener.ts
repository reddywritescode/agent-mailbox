export function startSmtpListener(): { close: () => Promise<void> } {
  return {
    async close() {
      return undefined;
    }
  };
}
