import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { autocompleteAddress, isAddressLookupEnabled } from '@/lib/location/getaddress';

/** Address suggestions. Proxied so the getAddress.io key never reaches the browser. */
export async function GET(request: Request) {
  const { profile } = await getSession();
  if (profile?.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  if (!isAddressLookupEnabled()) {
    return NextResponse.json({ enabled: false, suggestions: [] });
  }

  const term = new URL(request.url).searchParams.get('q') ?? '';
  const suggestions = await autocompleteAddress(term);

  return NextResponse.json({ enabled: true, suggestions });
}
