-- ADMIN ANALYTICS: FIVE MORE AREAS OF THE APP
--
-- Port from Ask Sunny (Pau, 28 Nov 2026): "add usage for the L10 all meetings and the form monitoring as well pls",
-- "also add ai training", "add google reviews too and calendar". Here: L10 meetings, the Forms Register, AI Training,
-- Google Reviews and Calendar, each a feature of its own with one category of the same name.
--
-- Its own migration: a value added to an enum cannot be used in the transaction that adds it, and the next migration
-- (20261128001100) uses these in a table, a function and the view.
--
-- Not applied by the pull request: applied after merge.

alter type public.activity_feature add value if not exists 'l10';
alter type public.activity_feature add value if not exists 'form_monitoring';
alter type public.activity_feature add value if not exists 'ai_training';
alter type public.activity_feature add value if not exists 'google_reviews';
alter type public.activity_feature add value if not exists 'calendar';

alter type public.activity_category add value if not exists 'l10_meeting';
alter type public.activity_category add value if not exists 'form_monitoring';
alter type public.activity_category add value if not exists 'ai_training';
alter type public.activity_category add value if not exists 'google_reviews';
alter type public.activity_category add value if not exists 'calendar';
