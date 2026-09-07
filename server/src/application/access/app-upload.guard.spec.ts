import { ExecutionContext } from '@nestjs/common';
import { AppUploadGuard } from './app-upload.guard';

describe('AppUploadGuard', () => {
  const access = { requireUse: jest.fn() };
  const guard = new AppUploadGuard(access as never);

  function ctxOf(req: unknown) {
    return {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('应用 id 非数字直接拒，不碰权限服务', async () => {
    await expect(
      guard.canActivate(
        ctxOf({ params: { id: 'abc' }, user: { id: 5 } }),
      ),
    ).rejects.toBeInstanceOf(Error);
    expect(access.requireUse).not.toHaveBeenCalled();
  });

  it('鉴权通过后放行给拦截器', async () => {
    access.requireUse.mockResolvedValue(undefined);
    await expect(
      guard.canActivate(ctxOf({ params: { id: '8' }, user: { id: 5 } })),
    ).resolves.toBe(true);
    expect(access.requireUse).toHaveBeenCalledWith(5, 8);
  });

  it('没有使用权时报错向上抛', async () => {
    access.requireUse.mockRejectedValue(new Error('没有使用权'));
    await expect(
      guard.canActivate(ctxOf({ params: { id: '8' }, user: { id: 5 } })),
    ).rejects.toThrow('没有使用权');
  });
});
