import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNativeApp, qrPngBlob, systemShare } from './share';

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
});

const qr = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });

describe('partage système', () => {
  it('dans l’application Android : écrit le QR en cache puis ouvre la feuille native avec le lien ET l’image', async () => {
    const writeFile = vi.fn().mockResolvedValue({ uri: 'file:///cache/onelink-qr.png' });
    const share = vi.fn().mockResolvedValue({});
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true, Plugins: { Share: { share }, Filesystem: { writeFile } } });
    expect(isNativeApp()).toBe(true);
    const out = await systemShare({ title: 'Awa', text: 'Découvrez', url: 'https://1link.test/awa', qr });
    expect(out).toBe('shared');
    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'onelink-qr.png', directory: 'CACHE', data: expect.any(String) }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://1link.test/awa', files: ['file:///cache/onelink-qr.png'], title: 'Awa' }));
  });

  it('dans l’application : un partage annulé n’est pas une erreur', async () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true, Plugins: { Share: { share: vi.fn().mockRejectedValue(new Error('Share canceled')) } } });
    expect(await systemShare({ title: 'Awa', url: 'https://1link.test/awa' })).toBe('cancelled');
  });

  it('dans un navigateur : Web Share avec le fichier QR quand il est accepté', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    expect(await systemShare({ title: 'Awa', url: 'https://1link.test/awa', qr })).toBe('shared');
    const arg = share.mock.calls[0]![0] as ShareData;
    expect(arg.url).toBe('https://1link.test/awa');
    expect(arg.files?.[0]?.name).toBe('onelink-qr.png');
  });

  it('dans un navigateur qui ne partage pas les fichiers : lien seul', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
    await systemShare({ title: 'Awa', url: 'https://1link.test/awa', qr });
    expect((share.mock.calls[0]![0] as ShareData).files).toBeUndefined();
  });

  it('sans partage système (ordinateur) : indisponible, pour afficher la boîte de dialogue', async () => {
    expect(isNativeApp()).toBe(false);
    expect(await systemShare({ title: 'Awa', url: 'https://1link.test/awa' })).toBe('unavailable');
  });

  it('génère un vrai PNG pour le QR code', async () => {
    const toBlob = vi.fn((cb: BlobCallback) => cb(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })));
    const fills: number[] = [];
    const ctx = { fillRect: (...a: number[]) => void fills.push(a[2]!), set fillStyle(_v: string) {} };
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag !== 'canvas') return create(tag);
      return { width: 0, height: 0, getContext: () => ctx, toBlob } as unknown as HTMLCanvasElement;
    });
    const blob = await qrPngBlob('https://1link.test/awa', 400);
    expect(blob?.type).toBe('image/png');
    expect(fills.length).toBeGreaterThan(100); // fond + modules sombres
    vi.restoreAllMocks();
  });
});
