import fs from 'fs/promises';
import { getCurrentContext } from '../lib/context';
import { asyncSpawn } from '../lib';
import axios from 'axios';
import Conf from 'conf';
import { schema } from '../schema';
import { Keys } from '../cli';

const config = new Conf(schema as any);

export type ModuleTypes = 'sandbox' | 'nodejs' | 'algorithm';

export interface Module {
  type: ModuleTypes;
  name: string;
  folder: string;
  entry: string;
}

export const Publish = async ({ name }: { name?: string }) => {
  let config: { [key: string]: unknown; modules: Module[] };
  try {
    config = JSON.parse(
      await fs.readFile(`.nstrumenta/config.json`, {
        encoding: 'utf8',
      })
    );
  } catch (error) {
    throw Error(error as string);
  }

  const modules = name ? config.modules.filter((m) => m.name === name) : config.modules;
  console.log(
    `publish modules ${modules.map(({ name }) => name).join(', ')} to project ${
      getCurrentContext().name
    }`
  );

  const promises = modules.map(publishModule);
  const results = await Promise.all(promises);

  console.log(results);
};

export const publishModule = async (module: Module) => {
  const filename = `${module.name}.tar.gz`;
  const { folder } = module;
  let url = '';

  // first, make tarball
  try {
    await asyncSpawn('tar', ['-czvf', filename, folder], { cwd: process.cwd() });
  } catch (e) {
    console.warn(`Error: problem creating ${filename} from ${folder}`);
    throw e;
  }

  // then, get an upload url to put the tarball into storage
  try {
    const apiKey = (config.get('keys') as Keys)[getCurrentContext().projectId];
    const response = await axios.post(
      'https://us-central1-macro-coil-194519.cloudfunctions.net/getSignedUploadUrl',
      {
        path: `${module.type}/${filename}`,
      },
      {
        headers: {
          contentType: 'application/json',
          'x-api-key': apiKey,
        },
      }
    );

    url = response.data?.uploadUrl;
  } catch (e) {
    console.warn('Error: problem getting upload url');
    throw e;
  }
  console.log(`url: `, url);

  // start the request, return promise
  return axios.put(url);
};
