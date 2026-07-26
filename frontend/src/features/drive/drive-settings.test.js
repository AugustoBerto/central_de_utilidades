import { describe, expect, it } from 'vitest';

import {
  buildDriveSettingsPayload,
  bytesToGiB,
  GIB_BYTES
} from './drive-settings';

describe('configurações do Drive', () => {
  it('converte bytes e GiB sem perder inteiros enviados ao backend', () => {
    expect(bytesToGiB(2 * GIB_BYTES)).toBe(2);
    expect(
      buildDriveSettingsPayload(
        { reservedGiB: '50', maxUploadGiB: '2' },
        { usedBytes: 5 * GIB_BYTES, uploadHardLimitBytes: 10 * GIB_BYTES }
      )
    ).toEqual({
      payload: {
        reservedBytes: 50 * GIB_BYTES,
        maxUploadBytes: 2 * GIB_BYTES
      },
      errors: {}
    });
  });

  it('impede cota menor que o uso e limite maior que a instalação', () => {
    const result = buildDriveSettingsPayload(
      { reservedGiB: 4, maxUploadGiB: 12 },
      { usedBytes: 5 * GIB_BYTES, uploadHardLimitBytes: 10 * GIB_BYTES }
    );

    expect(result.payload).toBeNull();
    expect(result.errors.reservedGiB).toContain('5 GiB');
    expect(result.errors.maxUploadGiB).toContain('10 GiB');
  });
});
