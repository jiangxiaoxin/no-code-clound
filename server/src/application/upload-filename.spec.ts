import { decodeUploadFilename, originalUploadName } from './upload-filename';

describe('decodeUploadFilename', () => {
  it('restores chinese names that multer decoded as latin1', () => {
    expect(decodeUploadFilename('å¤ææµè¯è¡¨-å¯¼å¥æ¨¡ç.xlsx')).toBe(
      '复杂测试表-导入模版.xlsx',
    );
  });

  it('keeps ascii names', () => {
    expect(decodeUploadFilename('a.xlsx')).toBe('a.xlsx');
  });

  it('keeps names that are already utf8', () => {
    expect(decodeUploadFilename('复杂测试表-导入模版.xlsx')).toBe(
      '复杂测试表-导入模版.xlsx',
    );
  });
});

describe('originalUploadName', () => {
  it('uses the decoded original filename', () => {
    expect(
      originalUploadName({
        originalname: 'å¤ææµè¯è¡¨-å¯¼å¥æ¨¡ç.xlsx',
        filename: 'uuid.xlsx',
      }),
    ).toBe('复杂测试表-导入模版.xlsx');
  });
});
