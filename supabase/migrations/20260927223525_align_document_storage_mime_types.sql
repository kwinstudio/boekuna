update storage.buckets
set allowed_mime_types = array[
 'application/pdf',
 'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/heic-sequence','image/heif-sequence','image/tiff','image/bmp',
 'text/csv','application/csv','text/plain','application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]::text[]
where id='kwinest-documents';
