// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { UploadCnis } from './upload-cnis';

afterEach(cleanup);

describe('UploadCnis', () => {
  it('a garantia de privacidade aparece antes de qualquer upload', () => {
    render(<UploadCnis />);
    expect(screen.getByText(/não sai do seu navegador/i)).toBeTruthy();
  });
});
