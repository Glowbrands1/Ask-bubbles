-- District Manager, 3 Nov 2026 (approved by Pau, 6 Nov 2026): the two South
-- Dakota stores had the same name on Google Reviews. The 5902 E 18th St store
-- is Dawley Farms, and the West Dodge Rd store is Omaha Dodge (Pau, 6 Nov).
-- Only the display names change: the store codes (Google's own profile codes,
-- the match key), addresses, matches and Google ids stay as they are. Matches
-- `APPROVED_GOOGLE_STORES` in src/config/company/google-reviews.ts.
update public.google_review_locations
set display_name = 'Dawley Farms, SD', updated_at = now()
where brand = 'buff_city_soap' and store_code = '338';

update public.google_review_locations
set display_name = 'Omaha Dodge, NE', updated_at = now()
where brand = 'buff_city_soap' and store_code = '264';
