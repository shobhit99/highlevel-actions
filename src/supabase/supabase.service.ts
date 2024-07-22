import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
    private readonly client: SupabaseClient;

    constructor(private readonly configService: ConfigService) {
        const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
        const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY');

        this.client = createClient(supabaseUrl, supabaseAnonKey);
    }

    async uploadFileAndGetPresignedUrl(path: string, contents: string) {
        const { data: uploadData, error: uploadError } = await this.client.storage
            .from('bulk-action-records')
            .upload(path, Buffer.from(contents), { contentType: 'application/json', upsert: true });

        if (uploadError) {
            throw new Error(`Error uploading file: ${uploadError.message}`);
        }

        const { data: urlData, error: urlError } = await this.client.storage
            .from('bulk-action-records')
            .createSignedUrl(path, 3600); // URL valid for 1 hour

        if (urlError) {
            throw new Error(`Error creating signed URL: ${urlError.message}`);
        }

        return { url: urlData.signedUrl };
    }
}
