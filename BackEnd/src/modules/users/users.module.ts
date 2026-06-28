import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UserExperienceListener } from './events/user-experience.listener';

@Module({
  imports: [TypeOrmModule.forFeature([User]), EventEmitterModule],
  controllers: [UsersController],
  providers: [UsersService, UserExperienceListener],
  exports: [UsersService],
})
export class UsersModule {}
