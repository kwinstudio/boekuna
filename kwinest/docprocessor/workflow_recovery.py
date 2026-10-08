"""Render cron entry point; no document/user credentials in task input."""
import os
from render import Render

if __name__=='__main__':
    Render().workflows.start_task(os.environ['DOCUMENT_WORKFLOW_SLUG']+'/recover_pending',[])
