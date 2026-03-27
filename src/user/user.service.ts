import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName?: string | null;
}

export interface UpdateUserAvatarInput {
  avatarUrl: string | null;
  avatarKey: string | null;
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  create(data: CreateUserInput): Promise<User> {
    const user = this.users.create({
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      displayName: data.displayName ?? null,
    });
    return this.users.save(user);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async updateAvatar(
    userId: string,
    input: UpdateUserAvatarInput,
  ): Promise<User | null> {
    const user = await this.findById(userId);
    if (!user) return null;
    user.avatarUrl = input.avatarUrl;
    user.avatarKey = input.avatarKey;
    return this.users.save(user);
  }
}
