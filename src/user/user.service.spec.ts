import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { UserService } from './user.service';

describe('UserService', () => {
  let userService: UserService;
  let repo: jest.Mocked<Pick<Repository<User>, 'create' | 'save' | 'findOne'>>;

  beforeEach(async () => {
    repo = {
      create: jest.fn((x) => x as User),
      save: jest.fn((x) => Promise.resolve(x as User)),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();

    userService = module.get(UserService);
  });

  it('create lowercases email', async () => {
    const saved: User = {
      id: 'id',
      email: 'a@b.com',
      passwordHash: 'h',
      displayName: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repo.save.mockResolvedValue(saved);

    await userService.create({
      email: 'A@B.COM',
      passwordHash: 'h',
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@b.com' }),
    );
  });
});
