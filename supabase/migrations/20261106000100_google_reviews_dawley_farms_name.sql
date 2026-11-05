-- District Manager, 3 Nov 2026 (approved by Pau, 6 Nov 2026): the two South
-- Dakota stores had the same name on Google Reviews. The 5902 E 18th St store
-- is Dawley Farms. Only its display name changes: store_code 338 (Google's own
-- profile code, the match key), the address, the match and the Google ids stay
-- as they are. Matches `APPROVED_GOOGLE_STORES` in src/config/company/google-reviews.ts.
update public.google_review_locations
set display_name = 'Dawley Farms, SD', updated_at = now()
where brand = 'buff_city_soap' and store_code = '338';
