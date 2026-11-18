import os
import pathlib
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from app.services.gemini_project_profiles import for_profile, project_settings

class ProfileTests(unittest.TestCase):
    def tearDown(self): project_settings.cache_clear()
    def test_four_distinct_projects(self):
        env = {'GEMINI_MULTI_PROJECT_ENABLED':'true'}
        for name in ('PLAN','SUGGESTION','MEMBER_CHAT','COACH_CHAT'):
            env[f'GEMINI_{name}_API_KEY'] = f'private-{name}'
            env[f'GEMINI_{name}_PROJECT_ID'] = f'project-{name}'
        with patch.dict(os.environ, env):
            project_settings.cache_clear()
            self.assertEqual(for_profile('plan'), ('private-PLAN','project-PLAN'))
            self.assertEqual(for_profile('coach_chat'), ('private-COACH_CHAT','project-COACH_CHAT'))
    def test_duplicate_project_rejected(self):
        env = {'GEMINI_MULTI_PROJECT_ENABLED':'true'}
        for name in ('PLAN','SUGGESTION','MEMBER_CHAT','COACH_CHAT'):
            env[f'GEMINI_{name}_API_KEY'] = f'private-{name}'
            env[f'GEMINI_{name}_PROJECT_ID'] = 'same-project'
        with patch.dict(os.environ, env):
            project_settings.cache_clear()
            with self.assertRaises(ValueError): for_profile('plan')
    def test_missing_credentials_rejected(self):
        with patch.dict(os.environ, {'GEMINI_MULTI_PROJECT_ENABLED':'true'}):
            project_settings.cache_clear()
            with self.assertRaises(ValueError): for_profile('member_chat')
if __name__ == '__main__': unittest.main()
