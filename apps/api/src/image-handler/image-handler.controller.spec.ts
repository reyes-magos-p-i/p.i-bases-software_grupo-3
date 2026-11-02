import { ImageHandlerController } from './image-handler.controller';
import { ImageHandlerService } from './image-handler.service';

describe('ImageHandlerController', () => {
  let controller: ImageHandlerController;
  let service: {
    savePoster: jest.Mock;
  };

  beforeEach(() => {
    service = {
      savePoster: jest.fn(),
    };

    controller = new ImageHandlerController(
      service as unknown as ImageHandlerService,
    );
  });

  it('passes the uploaded file to the service and returns its result', async () => {
    const file = {
      fieldname: 'image',
      originalname: 'poster.jpg',
      mimetype: 'image/jpeg',
      buffer: Buffer.from('poster'),
      size: 6,
    } as Express.Multer.File;

    const result = {
      filename: 'saved.jpg',
      path: '/uploads/posters/saved.jpg',
    };

    service.savePoster.mockResolvedValue(result);

    expect(await controller.uploadPoster(file)).toEqual(result);
    expect(service.savePoster).toHaveBeenCalledTimes(1);
    expect(service.savePoster).toHaveBeenCalledWith(file);
  });

  it('passes undefined to the service when no file is provided', async () => {
    service.savePoster.mockResolvedValue(undefined);

    await controller.uploadPoster();

    expect(service.savePoster).toHaveBeenCalledWith(undefined);
  });

  it('propagates service errors', async () => {
    const error = new Error('Invalid poster');
    service.savePoster.mockRejectedValue(error);

    await expect(controller.uploadPoster()).rejects.toBe(error);
  });
});
