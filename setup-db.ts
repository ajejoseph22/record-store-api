import * as mongoose from 'mongoose';
import { Record, RecordSchema } from './src/api/schemas/record.schema';
import { RecordFormat, RecordCategory } from './src/api/schemas/record.enum';
import * as fs from 'fs';
import { AppConfig } from './src/app.config';
import * as readline from 'readline';

interface SeedRecord {
  artist: string;
  album: string;
  price: number;
  qty: number;
  format: RecordFormat;
  category: RecordCategory;
  mbid?: string;
}

async function setupDatabase() {
  try {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(
      'Do you want to clean up the existing records collection? (Y/N): ',
      async (answer) => {
        rl.close();

        const data: SeedRecord[] = JSON.parse(
          fs.readFileSync('data.json', 'utf-8'),
        );
        const recordModel: mongoose.Model<Record> = mongoose.model<Record>(
          'Record',
          RecordSchema,
        );

        await mongoose.connect(AppConfig.mongoUrl);

        if (answer.toLowerCase() === 'y') {
          await recordModel.deleteMany({});
          console.log('Existing collection cleaned up.');
        }

        const normalizedData = data.map((record) => ({
          ...record,
          artistNormalized: String(record.artist).trim().toLowerCase(),
          albumNormalized: String(record.album).trim().toLowerCase(),
        }));
        const records = await recordModel.insertMany(normalizedData);
        console.log(`Inserted ${records.length} records successfully!`);

        mongoose.disconnect();
      },
    );
  } catch (error) {
    console.error('Error setting up the database:', error);
    mongoose.disconnect();
  }
}

setupDatabase();
