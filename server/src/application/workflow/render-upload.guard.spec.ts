import { ExecutionContext } from '@nestjs/common';
import { RenderUploadGuard } from './render-upload.guard';

describe('RenderUploadGuard', () => {
  const render = { assertWritable: jest.fn() };
  const guard = new RenderUploadGuard(render as never);

  function ctxOf(req: unknown) {
    return {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('没有 fieldKey 直接拒，不碰渲染服务', async () => {
    await expect(
      guard.canActivate(
        ctxOf({
          params: { instanceId: '7' },
          user: { id: 5 },
          query: {},
        }),
      ),
    ).rejects.toMatchObject({ message: '请指定字段' });
    expect(render.assertWritable).not.toHaveBeenCalled();
  });

  it('鉴权通过后放行给拦截器，检查参数是实例、人和字段', async () => {
    render.assertWritable.mockResolvedValue(undefined);
    await expect(
      guard.canActivate(
        ctxOf({
          params: { instanceId: '7' },
          user: { id: 5 },
          query: { fieldKey: 'field_file' },
        }),
      ),
    ).resolves.toBe(true);
    expect(render.assertWritable).toHaveBeenCalledWith(7, 5, 'field_file');
  });

  it('没有使用权时报错向上抛', async () => {
    render.assertWritable.mockRejectedValue(new Error('当前状态不能修改'));
    await expect(
      guard.canActivate(
        ctxOf({
          params: { instanceId: '7' },
          user: { id: 5 },
          query: { fieldKey: 'field_file' },
        }),
      ),
    ).rejects.toThrow('当前状态不能修改');
  });
});
