export function formatBytes(value) {
  if (value === null || value === undefined) return 'Indisponível';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${units[index]}`;
}

export function formatPercent(value) {
  return value === null || value === undefined
    ? 'Indisponível'
    : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

export function formatUptime(seconds) {
  if (seconds === null || seconds === undefined) return 'Indisponível';
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  return days ? `${days}d ${hours}h` : `${hours}h`;
}
