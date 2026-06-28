import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostmortemEntity } from './postmortems.entity';
import { PostmortemService } from './postmortems.service';
import { PostmortemController } from './postmortems.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PostmortemEntity])],
  providers: [PostmortemService],
  controllers: [PostmortemController],
  exports: [PostmortemService],
})
export class PostmortemsModule {}
