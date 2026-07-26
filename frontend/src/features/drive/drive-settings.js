export const GIB_BYTES = 1024 ** 3;

function positiveNumber(value, field, errors) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    errors[field] = 'Informe um valor maior que zero.';
    return null;
  }
  return parsed;
}

export function bytesToGiB(bytes) {
  if (!Number.isFinite(Number(bytes))) return 0;
  return Number((Number(bytes) / GIB_BYTES).toFixed(2));
}

export function buildDriveSettingsPayload(
  { reservedGiB, maxUploadGiB },
  { usedBytes = 0, uploadHardLimitBytes = Number.POSITIVE_INFINITY } = {}
) {
  const errors = {};
  const reserved = positiveNumber(reservedGiB, 'reservedGiB', errors);
  const maximum = positiveNumber(maxUploadGiB, 'maxUploadGiB', errors);

  if (Object.keys(errors).length) return { payload: null, errors };

  const reservedBytes = Math.round(reserved * GIB_BYTES);
  const maxUploadBytes = Math.round(maximum * GIB_BYTES);

  if (!Number.isSafeInteger(reservedBytes) || !Number.isSafeInteger(maxUploadBytes)) {
    return {
      payload: null,
      errors: { reservedGiB: 'O valor informado é muito grande.' }
    };
  }

  if (reservedBytes < usedBytes)
    errors.reservedGiB = `O Drive já utiliza ${bytesToGiB(usedBytes)} GiB.`;
  if (maxUploadBytes > reservedBytes)
    errors.maxUploadGiB = 'O limite por arquivo não pode exceder o espaço reservado.';
  if (
    Number.isFinite(uploadHardLimitBytes) &&
    maxUploadBytes > uploadHardLimitBytes
  )
    errors.maxUploadGiB = `Esta instalação permite no máximo ${bytesToGiB(
      uploadHardLimitBytes
    )} GiB por arquivo.`;

  return {
    payload: Object.keys(errors).length ? null : { reservedBytes, maxUploadBytes },
    errors
  };
}
